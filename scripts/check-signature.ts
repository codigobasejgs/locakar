/** Testes offline da assinatura Autentique (sem rede, sem token real). Rodar: node scripts/check-signature.cjs */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AutentiqueProvider, signerInput, verifyAutentiqueSignature } from "../src/lib/server/signature/autentique";
import { MockSignatureProvider } from "../src/lib/server/signature/mock";
import { buildSigners, publicSignatureConfig, statusFromDocument, type SignatureConfigRow } from "../src/lib/server/signature/service";
import { SignatureError, type ProviderDocument } from "../src/lib/server/signature/types";
import type { Client, Contract } from "../src/types";
import { inTestOrg } from "./test-org";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
process.env.SIGNATURE_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

inTestOrg(async () => {
  // ---------- HMAC do webhook ----------
  const body = JSON.stringify({ event: { id: "evt_12345678", type: "signature.accepted", data: { document: "doc_12345678" } } });
  const sig = createHmac("sha256", "segredo-de-teste-123456789").update(body).digest("hex");
  assert.equal(verifyAutentiqueSignature(body, sig, "segredo-de-teste-123456789"), true);
  assert.equal(verifyAutentiqueSignature(body + " ", sig, "segredo-de-teste-123456789"), false, "corpo alterado");
  assert.equal(verifyAutentiqueSignature(body, sig, "outro-segredo-123456789012"), false, "segredo errado");
  assert.equal(verifyAutentiqueSignature(body, null, "segredo-de-teste-123456789"), false);
  assert.equal(verifyAutentiqueSignature(body, "zz", "segredo-de-teste-123456789"), false);

  // ---------- Status: autoritativo, sem regressão ----------
  const doc = (signers: Partial<ProviderDocument["signers"][number]>[], deadlineAt: string | null = null): ProviderDocument => ({
    id: "d",
    name: "x",
    deadlineAt,
    signedFileUrl: null,
    signers: signers.map((s, i) => ({ publicId: `p${i}`, name: null, email: null, viewedAt: null, signedAt: null, rejectedAt: null, ...s })),
  });
  const now = new Date().toISOString();
  assert.equal(statusFromDocument(doc([{}, {}])), "awaiting_signature");
  assert.equal(statusFromDocument(doc([{ viewedAt: now }, {}])), "awaiting_signature", "visualizar não é assinar");
  assert.equal(statusFromDocument(doc([{ signedAt: now }, {}])), "partially_signed");
  assert.equal(statusFromDocument(doc([{ signedAt: now }, { signedAt: now }])), "completed");
  assert.equal(statusFromDocument(doc([{ rejectedAt: now }, {}])), "rejected");
  assert.equal(statusFromDocument(doc([{}, {}], "2000-01-01T00:00:00Z")), "expired");
  assert.equal(statusFromDocument(doc([{}, {}]), "completed"), "completed", "evento atrasado não regride concluído");
  assert.equal(statusFromDocument(doc([{ signedAt: now }, {}]), "cancelled"), "cancelled");
  assert.equal(statusFromDocument(doc([])), "awaiting_signature", "sem signatários nunca conclui");

  // ---------- Signatários mínimos ----------
  const contract = { id: "c1", companySigner: "Representante", companyEmail: null } as unknown as Contract;
  const client = { id: "cl1", name: "Cliente Fictício", email: "cliente@example.com", phone: "(19) 99999-0000", cpf: "529.982.247-25" } as Client;
  const signers = buildSigners({ contract, client, companyEmail: "empresa@example.com", companyName: "Locadora Teste", sortable: true });
  assert.deepEqual(signers.map((s) => [s.role, s.order]), [["client", 1], ["company", 2]]);
  assert.equal(signers[0].phone, null, "com e-mail não envia telefone");
  assert.deepEqual(signerInput(signers[0]), { action: "SIGN", configs: { cpf: "52998224725" }, email: "cliente@example.com" });
  const byPhone = buildSigners({ contract, client: { ...client, email: "" }, companyEmail: "empresa@example.com", companyName: "L", sortable: true });
  assert.equal(byPhone[0].phone, "+5519999990000");
  assert.equal((signerInput(byPhone[0]) as { delivery_method?: string }).delivery_method, "DELIVERY_METHOD_WHATSAPP");
  assert.equal(JSON.stringify(signerInput(signers[1])).includes("cpf"), false, "CPF só do locatário");
  assert.throws(() => buildSigners({ contract, client: { ...client, cpf: "123" }, companyEmail: "e@x.com", companyName: "L", sortable: true }), /CPF válido/);
  assert.throws(() => buildSigners({ contract, client: { ...client, email: "", phone: "" }, companyEmail: "e@x.com", companyName: "L", sortable: true }), /e-mail ou celular/);
  assert.throws(() => buildSigners({ contract, client, companyEmail: null, companyName: "L", sortable: true }), /representante/);

  // ---------- Config pública nunca expõe segredos ----------
  const row = { organization_id: "o", enabled: true, environment: "sandbox", sandbox_token_enc: "ENC-SECRET", sandbox_token_last4: "ABCD", sandbox_verified_at: now, production_token_enc: null, production_token_last4: null, production_verified_at: null, webhook_secret_enc: "ENC-HOOK", autentique_organization_id: 1, sortable: true, reminder: null, company_signer_email: null, last_error: null } as unknown as SignatureConfigRow;
  const pub = JSON.stringify(publicSignatureConfig(row));
  assert.ok(!pub.includes("ENC-SECRET") && !pub.includes("ENC-HOOK"), "token cifrado não sai");
  assert.ok(pub.includes("••••ABCD"));

  // ---------- Client GraphQL com fetch falso ----------
  const calls: { url: string; init: RequestInit }[] = [];
  const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  const queue: Response[] = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return queue.shift() ?? reply(500, {});
  }) as typeof fetch;
  const p = new AutentiqueProvider("tok_" + "x".repeat(30), fake);

  queue.push(reply(200, { data: { me: { name: "Conta", organization: { id: 42 } } } }));
  assert.deepEqual(await p.testConnection(), { autentiqueOrganizationId: 42, accountName: "Conta" });
  assert.equal(calls[0].url, "https://api.autentique.com.br/v2/graphql");
  assert.match(String((calls[0].init.headers as Record<string, string>).Authorization), /^Bearer tok_/);

  queue.push(reply(429, { message: "Too Many Attempts." }), reply(200, { data: { document: { id: "doc1", name: "n", signatures: [{ public_id: "s1", signed: { created_at: now } }], files: { signed: "https://api.autentique.com.br/f.pdf" } } } }));
  const got = await p.getDocument("doc1");
  assert.equal(got.signers[0].signedAt, now, "repetiu após 429");
  assert.equal(got.signedFileUrl, "https://api.autentique.com.br/f.pdf");

  queue.push(reply(401, { message: "Unauthenticated." }));
  await assert.rejects(p.getDocument("doc1"), (e: SignatureError) => e.code === "AUTENTIQUE_AUTH_ERROR");
  queue.push(reply(200, { errors: [{ message: "document_not_found" }] }));
  await assert.rejects(p.getDocument("x"), (e: SignatureError) => e.code === "AUTENTIQUE_DOCUMENT_NOT_FOUND");

  const before = calls.length;
  queue.push(reply(200, { data: { createDocument: { id: "doc2", name: "n", signatures: [{ public_id: "a" }, { public_id: "b" }] } } }));
  const pdf = new TextEncoder().encode("%PDF-1.7 teste");
  const created = await p.createDocument({ name: "Contrato", file: pdf, filename: "c.pdf", sandbox: true, sortable: true, reminder: null, signers });
  assert.deepEqual(created.signers.map((s) => s.publicId), ["a", "b"]);
  const form = calls[before].init.body as FormData;
  const ops = JSON.parse(String(form.get("operations")));
  assert.equal(ops.variables.document.sandbox, true, "Sandbox explícito");
  assert.equal(ops.variables.document.locale.timezone, "America/Sao_Paulo");
  assert.equal(form.get("map"), JSON.stringify({ file: ["variables.file"] }));
  assert.ok(form.get("file") instanceof Blob);
  await assert.rejects(p.createDocument({ name: "x", file: new Uint8Array(20 * 1024 * 1024 + 1), filename: "x.pdf", sandbox: true, sortable: true, reminder: null, signers }), (e: SignatureError) => e.code === "AUTENTIQUE_FILE_TOO_LARGE");

  await assert.rejects(p.download("https://evil.example.com/x.pdf"), /não autorizado/);
  await assert.rejects(p.download("http://api.autentique.com.br/x.pdf"), /não autorizado/);
  queue.push(new Response("<html>"));
  await assert.rejects(p.download("https://api.autentique.com.br/x.pdf"), /inválido/);

  // ---------- Fluxo com MockSignatureProvider ----------
  const mock = new MockSignatureProvider();
  const m = await mock.createDocument({ name: "C", file: pdf, filename: "c.pdf", sandbox: true, sortable: true, reminder: null, signers });
  assert.equal(statusFromDocument(await mock.getDocument(m.id)), "awaiting_signature");
  mock.sign(m.id, 0);
  assert.equal(statusFromDocument(await mock.getDocument(m.id)), "partially_signed");
  mock.sign(m.id, 1);
  assert.equal(statusFromDocument(await mock.getDocument(m.id)), "completed");
  await mock.blockDocument(m.id, "2000-01-01T00:00:00Z");
  assert.equal(statusFromDocument(await mock.getDocument(m.id), "completed"), "completed", "bloqueio após conclusão não regride");

  // ---------- Garantias estruturais ----------
  const migration = read("supabase/migrations/20261017000000_autentique_signatures.sql");
  assert.match(migration, /contract_signature_one_active_idx[\s\S]+where status in \('sending', 'awaiting_signature', 'partially_signed'\)/, "um processo ativo por contrato");
  assert.match(migration, /provider_event_id\s+text primary key/, "evento idempotente");
  assert.match(migration, /revoke all on public\.signature_provider_config from public, anon, authenticated/, "config só service role");
  assert.match(migration, /'contratos', 'contratos', false/, "bucket privado");
  const webhook = read("src/app/api/webhooks/autentique/route.ts");
  assert.match(webhook, /ignoreDuplicates: true/);
  assert.match(webhook, /x-autentique-signature/);
  for (const f of ["src/components/admin/autentique-settings.tsx", "src/components/admin/contract-signature.tsx", "apps/locatario/components/domain/ContractSignature.tsx"]) {
    const src = read(f);
    assert.ok(!/NEXT_PUBLIC_AUTENTIQUE|EXPO_PUBLIC_AUTENTIQUE|api\.autentique\.com\.br/.test(src), `${f}: frontend não fala com a Autentique`);
  }
  assert.ok(!/console\.(log|info|debug)/.test(read("src/lib/server/signature/autentique.ts") + read("src/lib/server/signature/service.ts")), "nada de logs com dados sensíveis");

  console.log("OK assinatura: HMAC, status sem regressão, signatários mínimos, GraphQL multipart, 429, erros, download seguro, mock e migration");
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
