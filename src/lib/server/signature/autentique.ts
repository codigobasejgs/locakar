import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignatureError, type CreateSignatureDocument, type ProviderDocument, type SignatureProvider, type SignatureSignerInput } from "./types";

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DOCUMENT_FIELDS = `id name deadline_at files { signed } signatures { public_id name email viewed { created_at } signed { created_at } rejected { created_at } }`;

type GraphResult<T> = { data?: T; errors?: { message?: string; extensions?: { validation?: Record<string, string[]> } }[] };

/** Somente servidor. O token chega descriptografado e nunca é retornado, logado ou serializado. */
export class AutentiqueProvider implements SignatureProvider {
  constructor(private token: string, private send: typeof fetch = fetch) {}

  private async call<T>(query: string, variables: Record<string, unknown> = {}, retry = true): Promise<T> {
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt++) {
      const res = await this.send(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      }).catch((e) => {
        throw new SignatureError("AUTENTIQUE_UNKNOWN_ERROR", e instanceof Error && e.name === "TimeoutError" ? "A Autentique demorou para responder." : "Não foi possível conectar à Autentique.", 502, true);
      });
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      if (res.status >= 500 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      return parseResult<T>(res, await res.json().catch(() => ({})));
    }
    throw new SignatureError("AUTENTIQUE_RATE_LIMIT", "Limite de consultas da Autentique atingido. Tente novamente em alguns instantes.", 429, true);
  }

  async testConnection() {
    const data = await this.call<{ me: { name?: string | null; organization?: { id?: number | null } | null } }>("query { me { name organization { id } } }");
    return { autentiqueOrganizationId: data.me.organization?.id ?? null, accountName: data.me.name ?? null };
  }

  async createDocument(input: CreateSignatureDocument) {
    if (input.file.byteLength > MAX_PDF_BYTES) throw new SignatureError("AUTENTIQUE_FILE_TOO_LARGE", "O PDF ultrapassa o limite de 20 MB da Autentique.");
    const form = new FormData();
    form.append("operations", JSON.stringify({ query: CREATE_DOCUMENT, variables: { document: documentInput(input), signers: input.signers.map(signerInput), file: null } }));
    form.append("map", JSON.stringify({ file: ["variables.file"] }));
    const bytes = input.file.buffer.slice(input.file.byteOffset, input.file.byteOffset + input.file.byteLength) as ArrayBuffer;
    form.append("file", new Blob([bytes], { type: "application/pdf" }), input.filename);
    const res = await this.send(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    }).catch(() => {
      throw new SignatureError("AUTENTIQUE_DOCUMENT_CREATE_FAILED", "A Autentique não confirmou o envio. Atualize o status antes de tentar novamente.", 502);
    });
    const data = await parseResult<{ createDocument: RawDocument }>(res, await res.json().catch(() => ({})), "AUTENTIQUE_DOCUMENT_CREATE_FAILED");
    return mapDocument(data.createDocument);
  }

  async getDocument(id: string) {
    const data = await this.call<{ document: RawDocument | null }>(`query ($id: UUID!) { document(id: $id) { ${DOCUMENT_FIELDS} } }`, { id });
    if (!data.document) throw new SignatureError("AUTENTIQUE_DOCUMENT_NOT_FOUND", "Documento não encontrado na Autentique.", 404);
    return mapDocument(data.document);
  }

  async createSignatureLink(publicId: string) {
    const data = await this.call<{ createLinkToSignature: { short_link?: string | null } }>("mutation ($id: String!) { createLinkToSignature(public_id: $id) { short_link } }", { id: publicId }, false);
    const link = data.createLinkToSignature.short_link;
    if (!link || !/^https:\/\//.test(link)) throw new SignatureError("AUTENTIQUE_SIGNATURE_LINK_FAILED", "Não foi possível gerar o link de assinatura.");
    return link;
  }

  async resend(publicIds: string[]) {
    await this.call<{ resendSignatures: boolean }>("mutation ($ids: [String!]!) { resendSignatures(public_ids: $ids) }", { ids: publicIds }, false);
  }

  async blockDocument(id: string, at: string) {
    await this.call<{ updateDocument: { id: string } }>("mutation ($id: UUID!, $document: UpdateDocumentInput!) { updateDocument(id: $id, document: $document) { id } }", { id, document: { deadline_at: at } }, false);
  }

  async download(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new SignatureError("AUTENTIQUE_DOWNLOAD_FAILED", "Endereço do documento assinado inválido.");
    }
    if (parsed.protocol !== "https:" || !/(^|\.)autentique\.com\.br$/.test(parsed.hostname)) throw new SignatureError("AUTENTIQUE_DOWNLOAD_FAILED", "Endereço do documento assinado não autorizado.");
    const res = await this.send(parsed, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(60_000), redirect: "follow", cache: "no-store" }).catch(() => null);
    if (!res?.ok) throw new SignatureError("AUTENTIQUE_DOWNLOAD_FAILED", "Não foi possível baixar o documento assinado.", 502, true);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new SignatureError("AUTENTIQUE_DOWNLOAD_FAILED", "A Autentique devolveu um arquivo inválido.");
    return bytes;
  }
}

const CREATE_DOCUMENT = `mutation ($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(document: $document, signers: $signers, file: $file) { ${DOCUMENT_FIELDS} }
}`;

type RawDocument = {
  id?: string;
  name?: string;
  deadline_at?: string | null;
  files?: { signed?: string | null } | null;
  signatures?: { public_id?: string; name?: string | null; email?: string | null; viewed?: { created_at?: string } | null; signed?: { created_at?: string } | null; rejected?: { created_at?: string } | null }[];
};

function mapDocument(d: RawDocument): ProviderDocument {
  if (!d?.id) throw new SignatureError("AUTENTIQUE_UNKNOWN_ERROR", "Resposta inválida da Autentique.", 502);
  return {
    id: d.id,
    name: d.name ?? "",
    deadlineAt: d.deadline_at ?? null,
    signedFileUrl: d.files?.signed ?? null,
    signers: (d.signatures ?? [])
      .filter((s) => s.public_id)
      .map((s) => ({ publicId: s.public_id!, name: s.name ?? null, email: s.email ?? null, viewedAt: s.viewed?.created_at ?? null, signedAt: s.signed?.created_at ?? null, rejectedAt: s.rejected?.created_at ?? null })),
  };
}

function documentInput(input: CreateSignatureDocument) {
  return {
    name: input.name,
    sandbox: input.sandbox,
    sortable: input.sortable,
    refusable: true,
    stop_on_rejected: true,
    reminder: input.reminder ?? undefined,
    locale: { country: "BR", language: "pt-BR", timezone: "America/Sao_Paulo", date_format: "DD_MM_YYYY" },
  };
}

export function signerInput(s: SignatureSignerInput) {
  const base = { action: s.action, configs: s.cpf ? { cpf: s.cpf.replace(/\D/g, "") } : undefined };
  if (s.email) return { ...base, email: s.email };
  if (s.phone) return { ...base, phone: s.phone, delivery_method: "DELIVERY_METHOD_WHATSAPP" };
  return { ...base, name: s.name };
}

async function parseResult<T>(res: Response, json: GraphResult<T> | Record<string, unknown>, fallback: "AUTENTIQUE_UNKNOWN_ERROR" | "AUTENTIQUE_DOCUMENT_CREATE_FAILED" = "AUTENTIQUE_UNKNOWN_ERROR"): Promise<T> {
  const body = json as GraphResult<T> & { message?: string };
  const msg = body.errors?.[0]?.message ?? body.message ?? "";
  if (res.status === 401 || /unauth|not authenticated/i.test(msg)) throw new SignatureError("AUTENTIQUE_AUTH_ERROR", "Token Autentique inválido ou expirado.", 424);
  if (res.status === 429 || /too many/i.test(msg)) throw new SignatureError("AUTENTIQUE_RATE_LIMIT", "Limite de consultas da Autentique atingido. Tente novamente em alguns instantes.", 429, true);
  if (/document_not_found|not found/i.test(msg)) throw new SignatureError("AUTENTIQUE_DOCUMENT_NOT_FOUND", "Documento não encontrado na Autentique.", 404);
  if (/must_be_a_valid_email|format_is_invalid|validation/i.test(msg)) throw new SignatureError("AUTENTIQUE_INVALID_SIGNER", "Confira nome, e-mail, telefone e CPF dos signatários.");
  if (!res.ok || body.errors?.length || !body.data) throw new SignatureError(fallback, "Não foi possível concluir a operação na Autentique.", res.status >= 500 ? 502 : 422, res.status >= 500);
  return body.data;
}

/** Valida o HMAC SHA-256 do corpo bruto conforme a documentação de webhooks. */
export function verifyAutentiqueSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
