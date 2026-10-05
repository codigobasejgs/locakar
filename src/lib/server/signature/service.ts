import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contractPdf } from "@/lib/pdf";
import { brand, requireOrg, siteUrl } from "@/lib/server/org-context";
import { notifyStaff, sendPushToClient, serviceDb } from "@/lib/server/push";
import { decrypt, encrypt, hasSecretKey } from "@/lib/server/secret";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { fromRow } from "@/repositories/mapping";
import type { Client, Contract, Rental } from "@/types";
import { AutentiqueProvider } from "./autentique";
import { MockSignatureProvider } from "./mock";
import { SignatureError, type ProviderDocument, type SignatureEnvironment, type SignatureProcessStatus, type SignatureProvider, type SignatureSignerInput } from "./types";

const KEY = "SIGNATURE_ENCRYPTION_KEY";
const BUCKET = "contratos";
const ACTIVE: SignatureProcessStatus[] = ["sending", "awaiting_signature", "partially_signed"];
const FINAL: SignatureProcessStatus[] = ["completed", "rejected", "expired", "cancelled"];

export interface SignatureConfigRow {
  enabled: boolean;
  environment: SignatureEnvironment;
  sandbox_token_enc: string | null;
  sandbox_token_last4: string | null;
  sandbox_verified_at: string | null;
  production_token_enc: string | null;
  production_token_last4: string | null;
  production_verified_at: string | null;
  webhook_secret_enc: string | null;
  autentique_organization_id: number | null;
  sortable: boolean;
  reminder: "DAILY" | "WEEKLY" | null;
  company_signer_email: string | null;
  last_error: string | null;
}

export const hasSignatureKey = () => hasSecretKey(KEY);
export const encryptSignatureSecret = (value: string) => encrypt(value, KEY);
const decryptSignatureSecret = (value: string) => decrypt(value, KEY);
export const webhookUrl = () => `${siteUrl()}/api/webhooks/autentique`;

export async function loadSignatureConfig(db: SupabaseClient = serviceDb()): Promise<SignatureConfigRow | null> {
  const { data, error } = await db.from("signature_provider_config").select("*").maybeSingle();
  if (error) return null;
  return data as SignatureConfigRow | null;
}

export function publicSignatureConfig(cfg: SignatureConfigRow | null) {
  const env = cfg?.environment ?? "sandbox";
  const keys = {
    sandbox: { configured: Boolean(cfg?.sandbox_token_enc), maskedToken: cfg?.sandbox_token_last4 ? `••••${cfg.sandbox_token_last4}` : null, verifiedAt: cfg?.sandbox_verified_at ?? null },
    production: { configured: Boolean(cfg?.production_token_enc), maskedToken: cfg?.production_token_last4 ? `••••${cfg.production_token_last4}` : null, verifiedAt: cfg?.production_verified_at ?? null },
  };
  return {
    migrationReady: Boolean(cfg),
    masterKeyReady: hasSignatureKey(),
    enabled: Boolean(cfg?.enabled),
    environment: env,
    keys,
    connected: Boolean(keys[env].configured && keys[env].verifiedAt),
    webhookConfigured: Boolean(cfg?.webhook_secret_enc),
    webhookUrl: webhookUrl(),
    sortable: cfg?.sortable ?? true,
    reminder: cfg?.reminder ?? null,
    companySignerEmail: cfg?.company_signer_email ?? null,
    lastError: cfg?.last_error ?? null,
  };
}
export type SignaturePublicConfig = ReturnType<typeof publicSignatureConfig>;

export function providerFor(cfg: SignatureConfigRow, env: SignatureEnvironment = cfg.environment): SignatureProvider {
  // Provider falso só fora de produção: em produção a flag é ignorada.
  if (process.env.SIGNATURE_PROVIDER === "mock" && process.env.VERCEL_ENV !== "production") return mockProvider();
  const enc = env === "sandbox" ? cfg.sandbox_token_enc : cfg.production_token_enc;
  if (!enc) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Configure o token da Autentique em Configurações → Integrações.", 409);
  return new AutentiqueProvider(decryptSignatureSecret(enc));
}

let mock: MockSignatureProvider | null = null;
export const mockProvider = () => (mock ??= new MockSignatureProvider());

export function readyToSend(cfg: SignatureConfigRow | null): cfg is SignatureConfigRow {
  if (!cfg?.enabled || !cfg.webhook_secret_enc) return false;
  return cfg.environment === "sandbox" ? Boolean(cfg.sandbox_token_enc && cfg.sandbox_verified_at) : Boolean(cfg.production_token_enc && cfg.production_verified_at);
}

export function webhookSecret(cfg: SignatureConfigRow) {
  if (!cfg.webhook_secret_enc) throw new SignatureError("AUTENTIQUE_WEBHOOK_ERROR", "Segredo do webhook não configurado.", 409);
  return decryptSignatureSecret(cfg.webhook_secret_enc);
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const cleanName = (s: string) => s.normalize("NFKC").replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);

/** Status do processo a partir do documento autoritativo da Autentique. */
export function statusFromDocument(doc: ProviderDocument, current?: SignatureProcessStatus): SignatureProcessStatus {
  if (current && FINAL.includes(current)) return current;
  if (doc.signers.some((s) => s.rejectedAt)) return "rejected";
  if (doc.signers.length && doc.signers.every((s) => s.signedAt)) return "completed";
  if (doc.deadlineAt && new Date(doc.deadlineAt).getTime() <= Date.now()) return "expired";
  return doc.signers.some((s) => s.signedAt) ? "partially_signed" : "awaiting_signature";
}

/** Signatários mínimos: só nome, contato e CPF quando necessário para a verificação. */
export function buildSigners(args: { contract: Contract; client: Client; companyEmail: string | null; companyName: string; sortable: boolean }): SignatureSignerInput[] {
  const { contract, client, companyEmail, companyName } = args;
  const missing: string[] = [];
  if (!client.name?.trim()) missing.push("nome do locatário");
  if (!client.email?.trim() && !client.phone?.trim()) missing.push("e-mail ou celular do locatário");
  if (!client.cpf?.replace(/\D/g, "").match(/^\d{11}$/)) missing.push("CPF válido do locatário");
  if (!companyEmail?.trim()) missing.push("e-mail do representante da locadora");
  if (missing.length) throw new HttpError(422, `Antes de enviar, complete: ${missing.join(", ")}.`);
  return [
    { role: "client", order: 1, action: "SIGN", name: client.name.trim(), email: client.email?.trim() || null, phone: client.email ? null : `+55${client.phone.replace(/\D/g, "")}`, cpf: client.cpf },
    { role: "company", order: 2, action: "SIGN", name: contract.companySigner?.trim() || companyName, email: companyEmail!.trim(), phone: null, cpf: null },
  ];
}

async function loadContractBundle(db: SupabaseClient, contractId: string) {
  const { data: row } = await db.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (!row) throw new HttpError(404, "Contrato não encontrado.");
  const contract = fromRow<Contract>(row);
  const { data: rentalRow } = await db.from("rentals").select("*").eq("id", contract.rentalId).maybeSingle();
  if (!rentalRow) throw new HttpError(404, "Locação do contrato não encontrada.");
  const rental = fromRow<Rental>(rentalRow);
  const { data: clientRow } = await db.from("clients").select("*").eq("id", rental.clientId).maybeSingle();
  if (!clientRow) throw new HttpError(404, "Locatário do contrato não encontrado.");
  return { contract, rental, client: fromRow<Client>(clientRow) };
}

export async function signatureState(db: SupabaseClient, contractId: string) {
  const { data: process } = await db.from("contract_signature_processes").select("*").eq("contract_id", contractId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!process) return null;
  const [{ data: signers }, { data: events }] = await Promise.all([
    db.from("contract_signers").select("id,role,sign_order,action,name,email,phone_last4,status,viewed_at,signed_at,rejected_at").eq("process_id", process.id).order("sign_order"),
    db.from("signature_events").select("provider_event_id,event_type,occurred_at,status").eq("process_id", process.id).order("occurred_at", { ascending: true }).limit(50),
  ]);
  return { process, signers: signers ?? [], events: events ?? [] };
}

export async function sendContract(contractId: string, actorId: string, ip: string | null, providerOverride?: SignatureProvider) {
  const db = serviceDb();
  const cfg = await loadSignatureConfig(db);
  if (!readyToSend(cfg)) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Ative e teste a Autentique em Configurações → Integrações antes de enviar.", 409);
  const { contract, client } = await loadContractBundle(db, contractId);
  if (contract.status !== "pending") throw new HttpError(409, "Somente contratos aguardando assinatura podem ser enviados.");
  const existing = await signatureState(db, contractId);
  if (existing && ACTIVE.includes(existing.process.status)) throw new HttpError(409, "Este contrato já foi enviado para assinatura.");

  const org = requireOrg().org;
  const signers = buildSigners({ contract, client, companyEmail: cfg.company_signer_email || contract.companyEmail || org.email, companyName: brand().legalName, sortable: cfg.sortable });
  const pdf = await contractPdf(contract, { name: brand().name, legalName: brand().legalName });
  const originalHash = sha256(pdf);
  const path = `${org.id}/contracts/${contract.id}/signature/autentique/${Date.now()}-original.pdf`;
  const { data: process, error } = await db
    .from("contract_signature_processes")
    .insert({ contract_id: contract.id, environment: cfg.environment, original_pdf_path: path, original_sha256: originalHash, created_by: actorId })
    .select("id")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "Este contrato já foi enviado para assinatura.");
  if (error) throw new HttpError(500, "Não foi possível reservar o envio.");

  try {
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw new HttpError(500, "Não foi possível guardar o PDF enviado.");
    const provider = providerOverride ?? providerFor(cfg);
    const plate = contract.content.match(/Placa:\s*([A-Z0-9-]{7,8})/i)?.[1] ?? "";
    const doc = await provider.createDocument({
      name: cleanName(`Contrato de Locação - ${client.name} - ${plate} - ${contract.id.slice(0, 8).toUpperCase()}`),
      file: pdf,
      filename: `contrato-${contract.id.slice(0, 8)}.pdf`,
      sandbox: cfg.environment === "sandbox",
      sortable: cfg.sortable,
      reminder: cfg.reminder,
      signers,
    });
    await db.from("contract_signature_processes").update({ provider_document_id: doc.id, status: "awaiting_signature", sent_at: new Date().toISOString(), last_synced_at: new Date().toISOString(), last_error: null }).eq("id", process.id);
    await db.from("contract_signers").insert(signers.map((s, i) => ({ process_id: process.id, role: s.role, sign_order: s.order, action: s.action, provider_public_id: doc.signers[i]?.publicId ?? null, name: s.name, email: s.email ?? null, phone_last4: s.phone?.replace(/\D/g, "").slice(-4) ?? null })));
    await audit({ actorType: "staff", actorId, action: "contract_signature_sent", entity: "contracts", entityId: contract.id, details: { provider: "autentique", environment: cfg.environment, processId: process.id, providerDocumentId: doc.id, originalSha256: originalHash }, ip });
    await sendPushToClient(client.id, { title: "Contrato disponível para assinatura", body: "Abra Minha locação para ler e assinar seu contrato.", url: "/locatario/locacao", severity: "info", tag: `signature-${process.id}` }, "locacao");
    return signatureState(db, contract.id);
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Falha ao enviar para assinatura.";
    // ponytail: criação inconclusiva não é repetida automaticamente; o operador atualiza o status antes de reenviar.
    await db.from("contract_signature_processes").update({ status: "error", last_error: message }).eq("id", process.id);
    throw e instanceof SignatureError ? new HttpError(e.status, e.message) : e;
  }
}

export async function syncProcess(processId: string, providerOverride?: SignatureProvider, eventId?: string) {
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("*").eq("id", processId).maybeSingle();
  if (!process?.provider_document_id) throw new HttpError(404, "Processo de assinatura não encontrado.");
  if (FINAL.includes(process.status) && process.status !== "completed") return signatureState(db, process.contract_id);
  const cfg = await loadSignatureConfig(db);
  if (!cfg) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Configuração Autentique ausente.", 409);
  const provider = providerOverride ?? providerFor(cfg, process.environment);
  const doc = await provider.getDocument(process.provider_document_id);
  const status = statusFromDocument(doc, process.status);
  const { data: signers } = await db.from("contract_signers").select("id,role,provider_public_id,status").eq("process_id", process.id);
  for (const local of signers ?? []) {
    const remote = doc.signers.find((s) => s.publicId === local.provider_public_id);
    if (!remote) continue;
    const next = remote.rejectedAt ? "rejected" : remote.signedAt ? "signed" : remote.viewedAt ? "viewed" : "pending";
    await db.from("contract_signers").update({ status: next, viewed_at: remote.viewedAt, signed_at: remote.signedAt, rejected_at: remote.rejectedAt, updated_at: new Date().toISOString() }).eq("id", local.id);
  }
  const patch: Record<string, unknown> = { status, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() };
  if (status === "completed" && !process.signed_pdf_path && doc.signedFileUrl) {
    const signed = await provider.download(doc.signedFileUrl);
    const signedPath = `${requireOrg().org.id}/contracts/${process.contract_id}/signature/autentique/${process.id}-final-signed.pdf`;
    const { error } = await db.storage.from(BUCKET).upload(signedPath, signed, { contentType: "application/pdf", upsert: false });
    if (error && !/exists/i.test(error.message)) throw new SignatureError("AUTENTIQUE_DOWNLOAD_FAILED", "Não foi possível guardar o contrato assinado.", 502, true);
    Object.assign(patch, { signed_pdf_path: signedPath, signed_sha256: sha256(signed), completed_at: new Date().toISOString() });
  }
  await db.from("contract_signature_processes").update(patch).eq("id", process.id);
  if (status !== process.status) {
    const { contract, rental, client } = await loadContractBundle(db, process.contract_id);
    if (status === "completed") {
      // Só o documento concluído na Autentique marca o contrato LOCAKAR como assinado.
      const signedAt = doc.signers.find((s) => s.publicId === signers?.find((l) => l.role === "client")?.provider_public_id)?.signedAt ?? new Date().toISOString();
      await db.from("contracts").update({ status: "signed", signed_name: client.name, signed_at: signedAt, signed_user_agent: "Autentique" }).eq("id", contract.id).eq("status", "pending");
    }
    const title = status === "completed" ? "Contrato concluído" : status === "rejected" ? "Contrato recusado" : status === "partially_signed" ? "Contrato parcialmente assinado" : "Assinatura atualizada";
    await notifyStaff([{ type: `contract.signature.${status}`, category: "contracts", severity: status === "rejected" ? "warning" : status === "completed" ? "success" : "info", title, body: `${client.name}: ${title.toLowerCase()} na Autentique.`, url: `/admin/rentals/${rental.id}`, dedupeKey: `signature:${process.id}:${status}` }]);
    if (status === "completed") await sendPushToClient(client.id, { title: "Contrato concluído", body: "Seu contrato foi assinado por todos. Você pode consultá-lo no app.", url: "/locatario/locacao", severity: "success", tag: `signature-${process.id}-completed` }, "locacao");
    await audit({ actorType: "system", action: "contract_signature_synced", entity: "contracts", entityId: contract.id, details: { processId: process.id, status, eventId: eventId ?? null } });
  }
  return signatureState(db, process.contract_id);
}

export async function signatureLink(processId: string, role: "client" | "company" = "client", providerOverride?: SignatureProvider) {
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("id,environment,status").eq("id", processId).maybeSingle();
  if (!process || !ACTIVE.includes(process.status)) throw new HttpError(409, "Este contrato não está aguardando assinatura.");
  const { data: signer } = await db.from("contract_signers").select("provider_public_id,status").eq("process_id", processId).eq("role", role).maybeSingle();
  if (!signer?.provider_public_id || signer.status === "signed") throw new HttpError(409, "Não há assinatura pendente para este signatário.");
  const cfg = await loadSignatureConfig(db);
  if (!cfg) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Configuração Autentique ausente.", 409);
  return (providerOverride ?? providerFor(cfg, process.environment)).createSignatureLink(signer.provider_public_id);
}

export async function resendSignatures(processId: string, actorId: string, providerOverride?: SignatureProvider) {
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("id,contract_id,environment,status").eq("id", processId).maybeSingle();
  if (!process || !ACTIVE.includes(process.status)) throw new HttpError(409, "Este contrato não está aguardando assinatura.");
  const { data: signers } = await db.from("contract_signers").select("provider_public_id").eq("process_id", processId).neq("status", "signed").neq("status", "rejected");
  const ids = (signers ?? []).map((s) => s.provider_public_id).filter(Boolean) as string[];
  if (!ids.length) throw new HttpError(409, "Não há assinaturas pendentes.");
  const cfg = await loadSignatureConfig(db);
  if (!cfg) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Configuração Autentique ausente.", 409);
  await (providerOverride ?? providerFor(cfg, process.environment)).resend(ids);
  await audit({ actorType: "staff", actorId, action: "contract_signature_resent", entity: "contracts", entityId: process.contract_id, details: { processId, count: ids.length } });
}

export async function cancelSignature(processId: string, actorId: string, providerOverride?: SignatureProvider) {
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("id,contract_id,environment,status,provider_document_id").eq("id", processId).maybeSingle();
  if (!process?.provider_document_id || !ACTIVE.includes(process.status)) throw new HttpError(409, "Este processo não pode ser cancelado.");
  const cfg = await loadSignatureConfig(db);
  if (!cfg) throw new SignatureError("AUTENTIQUE_NOT_CONFIGURED", "Configuração Autentique ausente.", 409);
  const now = new Date().toISOString();
  await (providerOverride ?? providerFor(cfg, process.environment)).blockDocument(process.provider_document_id, now);
  await db.from("contract_signature_processes").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("id", processId);
  await audit({ actorType: "staff", actorId, action: "contract_signature_cancelled", entity: "contracts", entityId: process.contract_id, details: { processId } });
}

export async function signedFile(processId: string) {
  const db = serviceDb();
  const { data: process } = await db.from("contract_signature_processes").select("signed_pdf_path,status").eq("id", processId).maybeSingle();
  if (!process?.signed_pdf_path || process.status !== "completed") throw new HttpError(404, "Contrato assinado ainda não disponível.");
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(process.signed_pdf_path, 60);
  if (error || !data?.signedUrl) throw new HttpError(500, "Não foi possível abrir o contrato assinado.");
  return data.signedUrl;
}
