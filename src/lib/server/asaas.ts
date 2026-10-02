import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASAAS_BASE,
  ASAAS_WEBHOOK_EVENTS,
  BILLING_LABEL,
  asaasErrorMessage,
  chargePayload,
  customerPayload,
  maskKey,
  redact,
  refundedCents,
  stateFromSnapshot,
  txReference,
  type AsaasBillingType,
  type AsaasEnvironment,
  type PaymentSnapshot,
} from "@/lib/asaas";
import { COMPANY } from "@/lib/company";
import { decryptSecret, hasMasterKey } from "@/lib/server/asaas-crypto";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { openReceipt } from "@/lib/server/infinitepay";
import { notifyStaff, sendPushToClient } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { formatCurrency, formatDate, todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * Provider Asaas: único lugar que fala HTTP com o Asaas. Tudo passa por aqui (painel, app e webhook).
 * A API Key vem decifrada do banco (asaas_config) só dentro desta função de requisição e nunca é logada/retornada.
 */

const log = (event: string, extra: Record<string, unknown> = {}) => console.info(`[asaas] ${event}`, redact(extra));
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || COMPANY.siteUrl).replace(/\/+$/, "");
export const webhookUrl = () => `${siteUrl()}/api/webhooks/asaas`;

export interface AsaasConfigRow {
  enabled: boolean;
  environment: AsaasEnvironment;
  methods: string[];
  allow_undefined: boolean;
  fine_percent: number | null;
  interest_percent: number | null;
  discount_percent: number | null;
  discount_days: number | null;
  notify_asaas: boolean;
  notify_whatsapp: boolean;
  notify_email: boolean;
  sandbox_key_enc: string | null;
  sandbox_key_last4: string | null;
  sandbox_verified_at: string | null;
  sandbox_webhook_id: string | null;
  sandbox_webhook_hash: string | null;
  production_key_enc: string | null;
  production_key_last4: string | null;
  production_verified_at: string | null;
  production_webhook_id: string | null;
  production_webhook_hash: string | null;
  last_error: string | null;
  updated_at: string;
}

export async function loadAsaasConfig(db: SupabaseClient): Promise<AsaasConfigRow | null> {
  const { data, error } = await db.from("asaas_config").select("*").eq("id", 1).maybeSingle();
  if (error) return null; // migration ainda não aplicada → integração indisponível, resto do sistema segue
  return data as AsaasConfigRow | null;
}

const envCols = (env: AsaasEnvironment) => ({
  keyEnc: `${env}_key_enc` as const,
  last4: `${env}_key_last4` as const,
  verified: `${env}_verified_at` as const,
  webhookId: `${env}_webhook_id` as const,
  webhookHash: `${env}_webhook_hash` as const,
});
export { envCols };

/** Visão pública: nunca inclui a chave nem o hash do token. */
export function publicConfig(cfg: AsaasConfigRow | null) {
  const env = cfg?.environment ?? "sandbox";
  const c = envCols(env);
  return {
    migrationReady: Boolean(cfg),
    masterKeyReady: hasMasterKey(),
    enabled: Boolean(cfg?.enabled),
    environment: env,
    configured: Boolean(cfg?.[c.keyEnc]),
    maskedKey: maskKey(cfg?.[c.last4]),
    verifiedAt: cfg?.[c.verified] ?? null,
    webhookConfigured: Boolean(cfg?.[c.webhookId] && cfg?.[c.webhookHash]),
    keys: {
      sandbox: { configured: Boolean(cfg?.sandbox_key_enc), maskedKey: maskKey(cfg?.sandbox_key_last4), verifiedAt: cfg?.sandbox_verified_at ?? null, webhook: Boolean(cfg?.sandbox_webhook_hash) },
      production: { configured: Boolean(cfg?.production_key_enc), maskedKey: maskKey(cfg?.production_key_last4), verifiedAt: cfg?.production_verified_at ?? null, webhook: Boolean(cfg?.production_webhook_hash) },
    },
    methods: cfg?.methods ?? ["PIX", "BOLETO", "CREDIT_CARD"],
    allowUndefined: cfg?.allow_undefined ?? true,
    finePercent: cfg?.fine_percent ?? null,
    interestPercent: cfg?.interest_percent ?? null,
    discountPercent: cfg?.discount_percent ?? null,
    discountDays: cfg?.discount_days ?? null,
    notifyAsaas: cfg?.notify_asaas ?? false,
    notifyWhatsapp: cfg?.notify_whatsapp ?? true,
    notifyEmail: cfg?.notify_email ?? false,
    lastError: cfg?.last_error ?? null,
    webhookUrl: webhookUrl(),
  };
}
export type AsaasPublicConfig = ReturnType<typeof publicConfig>;

/** Pronto para criar cobranças novas: ativado + chave verificada + webhook registrado no ambiente atual. */
export function readyForCharges(cfg: AsaasConfigRow | null): cfg is AsaasConfigRow {
  if (!cfg?.enabled) return false;
  const c = envCols(cfg.environment);
  return Boolean(cfg[c.keyEnc] && cfg[c.verified] && cfg[c.webhookHash]);
}

/** Erro do Asaas já com mensagem segura. `upstream` = HTTP do Asaas; `status` = HTTP devolvido ao painel/app. */
export class AsaasError extends HttpError {
  constructor(public upstream: number, message: string, public inconclusive = false) {
    super(upstream === 401 || upstream === 403 ? 424 : upstream === 404 || upstream === 429 || upstream === 504 ? upstream : upstream >= 500 ? 502 : 422, message);
  }
}
/** Criação de cobrança com resposta inconclusiva: a tentativa fica "started" até a conciliação. */
class InconclusiveCharge extends HttpError {}

/** Requisição autenticada. `key` é a chave já decifrada; nunca sai desta função. */
export async function asaasFetch<T = Record<string, unknown>>(
  env: AsaasEnvironment,
  key: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  send: typeof fetch = fetch,
): Promise<T> {
  let res: Response;
  try {
    res = await send(`${ASAAS_BASE[env]}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "LOCAKAR", access_token: key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    log("request_failed", { method, path, reason: timeout ? "timeout" : "network" });
    // Timeout em escrita é inconclusivo: a operação pode ter sido criada no Asaas.
    throw new AsaasError(504, timeout ? "O Asaas demorou para responder." : "Não foi possível conectar ao Asaas.", method !== "GET");
  }
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    log("request_error", { method, path, status: res.status, code: (json as { errors?: { code?: string }[] })?.errors?.[0]?.code });
    throw new AsaasError(res.status, asaasErrorMessage(res.status, json), res.status >= 500 && method !== "GET");
  }
  return json as T;
}

/** Chave decifrada do ambiente atual (ou do pedido). Lança se não houver. */
export function apiKeyFor(cfg: AsaasConfigRow, env: AsaasEnvironment = cfg.environment) {
  const enc = cfg[envCols(env).keyEnc];
  if (!enc) throw new HttpError(409, "Configure a API Key do Asaas em Configurações → Asaas.");
  return decryptSecret(enc);
}

// ------------------------------------------------------------------ clientes

/**
 * Cliente LOCAKAR ↔ cliente Asaas sem duplicar: vínculo local → busca por externalReference → busca por CPF/CNPJ → cria.
 * Timeout na criação: consulta de novo antes de qualquer nova tentativa.
 */
export async function ensureCustomer(db: SupabaseClient, cfg: AsaasConfigRow, key: string, clientId: string): Promise<string> {
  const env = cfg.environment;
  const { data: link } = await db.from("asaas_customers").select("customer_id").eq("client_id", clientId).eq("environment", env).maybeSingle();
  if (link?.customer_id) return link.customer_id as string;

  const { data: client } = await db.from("clients").select("id,name,cpf,email,phone,cep,street,number,complement,neighborhood").eq("id", clientId).maybeSingle();
  if (!client) throw new HttpError(404, "Cliente não encontrado.");
  const payload = customerPayload(client, !cfg.notify_asaas);

  const find = async () => {
    const byRef = await asaasFetch<{ data?: { id: string; deleted?: boolean }[] }>(env, key, "GET", `/customers?externalReference=${encodeURIComponent(String(payload.externalReference))}&limit=10`);
    const hit = byRef.data?.find((c) => !c.deleted);
    if (hit) return hit.id;
    const byDoc = await asaasFetch<{ data?: { id: string; deleted?: boolean }[] }>(env, key, "GET", `/customers?cpfCnpj=${payload.cpfCnpj}&limit=10`);
    return byDoc.data?.find((c) => !c.deleted)?.id ?? null;
  };

  let id = await find();
  if (!id) {
    try {
      id = (await asaasFetch<{ id: string }>(env, key, "POST", "/customers", payload)).id;
    } catch (e) {
      if (!(e instanceof AsaasError && e.inconclusive)) throw e;
      id = await find(); // pode ter sido criado apesar do timeout
      if (!id) throw new HttpError(502, "O Asaas não respondeu ao cadastrar o cliente. Tente novamente.");
    }
  }
  await db.from("asaas_customers").upsert({ client_id: clientId, environment: env, customer_id: id });
  await audit({ actorType: "system", action: "asaas_customer_linked", entity: "clients", entityId: clientId, details: { environment: env, customerId: id } });
  return id;
}

// ------------------------------------------------------------------ cobranças

export const TX_COLS =
  "id,provider,flow,rental_id,receipt_id,client_id,amount_cents,status,environment,provider_payment_id,provider_customer_id,external_reference,billing_type,provider_status,invoice_url,bank_slip_url,due_date,paid_amount_cents,refunded_cents,chargeback_status,last_error,created_at,updated_at,paid_at,provider_updated_at";

export interface AsaasTx {
  id: string;
  rental_id: string;
  receipt_id: string;
  client_id: string;
  amount_cents: number;
  status: string;
  environment: AsaasEnvironment | null;
  provider_payment_id: string | null;
  billing_type: string | null;
  provider_status: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  due_date: string | null;
  paid_amount_cents: number | null;
  refunded_cents: number | null;
  chargeback_status: string | null;
  paid_at: string | null;
}

/** Cobrança Asaas ativa (criando ou em aberto) da parcela, se houver. */
export async function activeCharge(db: SupabaseClient, rentalId: string, receiptId: string) {
  const { data } = await db
    .from("payment_transactions")
    .select(TX_COLS)
    .eq("provider", "asaas")
    .eq("rental_id", rentalId)
    .eq("receipt_id", receiptId)
    .in("status", ["started", "link_created"])
    .maybeSingle();
  return data as AsaasTx | null;
}

/**
 * Cria a cobrança de uma parcela. Proteções contra duplicidade:
 *  1. índice único: só uma tentativa Asaas ativa por parcela (duplo clique/concorrência perde no INSERT);
 *  2. externalReference = locakar-tx:<id> determinístico;
 *  3. timeout/5xx inconclusivo: busca por externalReference antes de considerar falha (a tentativa fica "started").
 * Valor e vencimento vêm do servidor (parcela + multa/juros do dia), nunca do navegador/app.
 */
export async function createCharge(
  db: SupabaseClient,
  cfg: AsaasConfigRow,
  p: { rentalId: unknown; receiptId: unknown; billingType: unknown; clientId?: string; actor: { type: "staff" | "client"; id?: string | null; ip?: string | null } },
) {
  if (!readyForCharges(cfg)) throw new HttpError(409, "Integração Asaas desativada ou incompleta. Verifique Configurações → Asaas.");
  const { rental, receipt, index, cents, client, vehicle } = await openReceipt(db, p.rentalId, p.receiptId);
  if (p.clientId && rental.clientId !== p.clientId) throw new HttpError(404, "Parcela não encontrada.");

  const existing = await activeCharge(db, rental.id, receipt.id);
  if (existing) {
    if (existing.status === "started") throw new HttpError(409, "Já existe uma cobrança Asaas sendo gerada para esta parcela. Atualize o status em instantes.");
    return { tx: existing, reused: true };
  }

  const allowed = [...cfg.methods, ...(cfg.allow_undefined ? ["UNDEFINED"] : [])];
  const billingType = (typeof p.billingType === "string" ? p.billingType : "") as AsaasBillingType;
  if (!allowed.includes(billingType)) throw new HttpError(422, "Forma de pagamento não habilitada em Configurações → Asaas.");

  const key = apiKeyFor(cfg);
  const env = cfg.environment;
  const today = todaySP();
  // Parcela vencida: o total do dia já inclui multa/juros do LOCAKAR; vence hoje para não cobrar encargo em dobro.
  const dueDate = receipt.dueDate < today ? today : receipt.dueDate;

  const { data: tx, error } = await db
    .from("payment_transactions")
    .insert({ provider: "asaas", flow: "charge", rental_id: rental.id, receipt_id: receipt.id, client_id: rental.clientId, amount_cents: cents, environment: env, billing_type: billingType, due_date: dueDate, operator_id: p.actor.type === "staff" ? p.actor.id : null, device: p.actor.type === "client" ? "app-locatario" : null })
    .select("id")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "Esta parcela já possui uma cobrança Asaas.");
  if (error) throw new HttpError(500, "Não foi possível registrar a cobrança.");
  const ref = txReference(tx.id);
  await db.from("payment_transactions").update({ external_reference: ref }).eq("id", tx.id);

  try {
    const customer = await ensureCustomer(db, cfg, key, rental.clientId);
    const body = chargePayload({
      customer,
      billingType,
      cents,
      dueDate,
      description: `LOCAKAR · ${vehicle?.plate ?? "Locação"} · ${receipt.description || `Parcela ${index + 1}`} · venc. ${formatDate(receipt.dueDate)}`.replace(/\s+/g, " "),
      externalReference: ref,
      // Após o vencimento da parcela os encargos já entraram no valor; regras do Asaas só valem para parcelas em dia.
      rules: receipt.dueDate < today ? {} : { finePercent: cfg.fine_percent, interestPercent: cfg.interest_percent, discountPercent: cfg.discount_percent, discountDays: cfg.discount_days },
    });
    let payment: PaymentSnapshot;
    try {
      payment = await asaasFetch<PaymentSnapshot>(env, key, "POST", "/payments", body);
    } catch (e) {
      if (!(e instanceof AsaasError && e.inconclusive)) throw e;
      const found = await asaasFetch<{ data?: PaymentSnapshot[] }>(env, key, "GET", `/payments?externalReference=${encodeURIComponent(ref)}&limit=5`);
      const hit = found.data?.find((x) => !x.deleted);
      if (!hit) {
        // Continua "started": bloqueia nova criação até a conciliação manual confirmar que nada foi criado.
        await db.from("payment_transactions").update({ last_error: "Resposta inconclusiva do Asaas. Use “Atualizar status” antes de tentar de novo." }).eq("id", tx.id);
        throw new InconclusiveCharge(504, "O Asaas não respondeu. Use “Atualizar status” em instantes para verificar se a cobrança foi criada.");
      }
      payment = hit;
    }
    const saved = await applySnapshot(db, tx.id, payment, { type: p.actor.type === "client" ? "client" : "staff", id: p.actor.id ?? null }, customer);
    await audit({ actorType: p.actor.type, actorId: p.actor.id ?? null, action: "asaas_charge_created", entity: "payment_transactions", entityId: tx.id, details: { environment: env, rentalId: rental.id, receiptId: receipt.id, amountCents: cents, billingType, providerPaymentId: payment.id, via: p.actor.type === "client" ? "app" : "painel" }, ip: p.actor.ip ?? null });
    log("charge_created", { tx: tx.id, env, billingType });
    return { tx: saved ?? (await loadTx(db, tx.id)), reused: false, client };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao gerar a cobrança.";
    if (!(e instanceof InconclusiveCharge)) {
      await db.from("payment_transactions").update({ status: "failed", last_error: message.slice(0, 300) }).eq("id", tx.id).eq("status", "started");
      await audit({ actorType: p.actor.type, actorId: p.actor.id ?? null, action: "asaas_charge_failed", entity: "payment_transactions", entityId: tx.id, details: { environment: env, error: message.slice(0, 300) }, ip: p.actor.ip ?? null });
    }
    if (e instanceof AsaasError) throw new HttpError(e.status, `Não foi possível gerar a cobrança Asaas. ${message}`);
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, `Não foi possível gerar a cobrança Asaas. ${message}`);
  }
}

export async function loadTx(db: SupabaseClient, id: unknown): Promise<AsaasTx> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Cobrança inválida.");
  const { data } = await db.from("payment_transactions").select(TX_COLS).eq("id", id).eq("provider", "asaas").maybeSingle();
  if (!data) throw new HttpError(404, "Cobrança não encontrada.");
  return data as AsaasTx;
}

/**
 * Aplica o estado ATUAL da cobrança no Asaas à tentativa e à parcela. Idempotente e tolerante a ordem:
 * a decisão vem do snapshot (GET), não do tipo de evento, e cada transição é condicional ao estado anterior.
 */
export async function applySnapshot(db: SupabaseClient, txId: string, p: PaymentSnapshot, actor: { type: "staff" | "client" | "system"; id?: string | null }, customerId?: string) {
  const { data: before } = await db.from("payment_transactions").select(TX_COLS).eq("id", txId).maybeSingle();
  if (!before) return null;
  const tx = before as AsaasTx;
  const state = stateFromSnapshot(p);
  const refunded = refundedCents(p);
  const now = new Date().toISOString();
  const common = {
    provider_payment_id: p.id,
    ...(customerId || p.customer ? { provider_customer_id: customerId ?? p.customer } : {}),
    provider_status: p.deleted ? "DELETED" : (p.status ?? tx.provider_status),
    billing_type: p.billingType ?? tx.billing_type,
    invoice_url: p.invoiceUrl ?? tx.invoice_url,
    bank_slip_url: p.bankSlipUrl ?? tx.bank_slip_url,
    due_date: p.dueDate ?? tx.due_date,
    refunded_cents: refunded,
    chargeback_status: p.chargeback?.status ?? tx.chargeback_status,
    provider_updated_at: now,
    last_error: null,
  };

  if (state === "paid" || state === "chargeback") {
    // Quitar só uma vez: update condicional (status != paid/chargeback) + índice único de parcela paga.
    const paidCents = Math.round((p.value ?? tx.amount_cents / 100) * 100);
    const { data: won, error } = await db
      .from("payment_transactions")
      .update({ ...common, status: state, paid_amount_cents: paidCents, paid_at: tx.paid_at ?? now })
      .eq("id", txId)
      .not("status", "in", "(paid,chargeback)")
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") {
      await db.from("payment_transactions").update({ ...common, last_error: "Parcela já quitada por outro pagamento. Verifique estorno/duplicidade." }).eq("id", txId);
      return loadTx(db, txId);
    }
    if (won) await settleReceipt(db, tx, p, paidCents, actor);
    else await db.from("payment_transactions").update({ ...common, status: state }).eq("id", txId); // já quitada: só atualiza dados (ex.: CONFIRMED → RECEIVED, chargeback)
    if (state === "chargeback" && tx.status !== "chargeback") await chargebackNotice(db, tx, p);
  } else if (state === "refunded") {
    const { data: won } = await db.from("payment_transactions").update({ ...common, status: "refunded" }).eq("id", txId).neq("status", "refunded").select("id").maybeSingle();
    if (won && (tx.status === "paid" || tx.status === "chargeback")) await reopenReceipt(db, tx, "Estornado via Asaas");
  } else if (state === "cancelled") {
    // Removida no Asaas: só cancela se ainda não foi paga (evento atrasado não desfaz pagamento).
    await db.from("payment_transactions").update({ ...common, status: "cancelled" }).eq("id", txId).in("status", ["started", "link_created", "failed"]);
  } else {
    // Em aberto/vencida: não rebaixa paga/estornada; só sai de started/failed/cancelled (restaurada).
    await db.from("payment_transactions").update(common).eq("id", txId);
    await db.from("payment_transactions").update({ status: "link_created" }).eq("id", txId).in("status", ["started", "failed", "cancelled"]);
  }
  return loadTx(db, txId);
}

async function loadRental(db: SupabaseClient, rentalId: string) {
  const { data } = await db.from("rentals").select("*").eq("id", rentalId).maybeSingle();
  return data ? fromRow<Rental>(data) : null;
}

async function settleReceipt(db: SupabaseClient, tx: AsaasTx, p: PaymentSnapshot, paidCents: number, actor: { type: "staff" | "client" | "system"; id?: string | null }) {
  const rental = await loadRental(db, tx.rental_id);
  const index = rental ? rental.receipts.findIndex((r) => r.id === tx.receipt_id) : -1;
  const method = `Asaas · ${BILLING_LABEL[p.billingType ?? ""] ?? "Cobrança"}`;
  const paidAt = (p.clientPaymentDate || p.paymentDate || p.confirmedDate || todaySP()).slice(0, 10);
  const amount = paidCents / 100;
  if (rental && index >= 0 && !rental.receipts[index].paid) {
    const receipts = rental.receipts.map((r) =>
      r.id === tx.receipt_id ? { ...r, paid: true, paidAt, amountPaid: amount, paymentMethod: method, notes: [r.notes, `Asaas ${p.id}`].filter(Boolean).join(" · "), settledBy: "Asaas" } : r,
    );
    await db.from("rentals").update({ receipts, updated_at: new Date().toISOString() }).eq("id", rental.id);
  }
  await audit({ actorType: actor.type, actorId: actor.id ?? null, action: "asaas_payment_confirmed", entity: "payment_transactions", entityId: tx.id, details: { rentalId: tx.rental_id, receiptId: tx.receipt_id, amountCents: paidCents, providerPaymentId: p.id, providerStatus: p.status, billingType: p.billingType } });
  log("payment_confirmed", { tx: tx.id, status: p.status });

  const { data: client } = await db.from("clients").select("id,name,email").eq("id", tx.client_id).maybeSingle();
  await Promise.all([
    notifyStaff([{ type: "payment.received", category: "payments", severity: "success", title: "Pagamento Asaas confirmado", body: `${client?.name ?? "Cliente"} · ${formatCurrency(amount)} · ${method}`, url: "/admin/pagamentos", dedupeKey: `asaas:${tx.id}:paid` }], { db }),
    client ? sendPushToClient(client.id, { title: "Pagamento confirmado", body: `Recebemos ${formatCurrency(amount)} (${method}).`, url: "/", severity: "success", tag: `asaas-${tx.id}` }, "pagamentos") : null,
    client?.email
      ? sendEmail(db, {
          kind: "receipt",
          to: client.email,
          rentalId: tx.rental_id,
          subject: `Pagamento confirmado — ${formatCurrency(amount)} — LOCAKAR`,
          html: emailLayout({
            title: "Pagamento confirmado",
            intro: `Olá, ${client.name}! Confirmamos o pagamento abaixo.`,
            rows: [
              ["Parcela", index >= 0 ? String(index + 1) : "—"],
              ["Vencimento", index >= 0 && rental ? formatDate(rental.receipts[index].dueDate) : "—"],
              ["Valor", formatCurrency(amount)],
              ["Forma", method],
              ["Identificação", p.id],
            ],
          }),
        }).catch((e) => console.error("[asaas] e-mail:", (e as Error).message))
      : null,
  ]);
}

async function reopenReceipt(db: SupabaseClient, tx: AsaasTx, reason: string) {
  const rental = await loadRental(db, tx.rental_id);
  if (rental) {
    const receipts = rental.receipts.map((r) =>
      r.id === tx.receipt_id && r.paid && r.settledBy === "Asaas"
        ? { ...r, paid: false, paidAt: undefined, amountPaid: undefined, paymentMethod: undefined, settledBy: undefined, notes: [r.notes, `${reason} em ${formatDate(todaySP())} (pago antes: ${formatCurrency(r.amountPaid ?? r.amount)})`].filter(Boolean).join(" · ") }
        : r,
    );
    await db.from("rentals").update({ receipts, updated_at: new Date().toISOString() }).eq("id", rental.id);
  }
  await audit({ actorType: "system", action: "asaas_payment_refunded", entity: "payment_transactions", entityId: tx.id, details: { rentalId: tx.rental_id, receiptId: tx.receipt_id } });
  await notifyStaff([{ type: "payment.refunded", category: "payments", severity: "warning", title: "Pagamento Asaas estornado", body: `A parcela voltou a ficar em aberto (${formatCurrency((tx.paid_amount_cents ?? tx.amount_cents) / 100)}).`, url: "/admin/pagamentos", dedupeKey: `asaas:${tx.id}:refunded` }], { db });
}

async function chargebackNotice(db: SupabaseClient, tx: AsaasTx, p: PaymentSnapshot) {
  await audit({ actorType: "system", action: "asaas_chargeback", entity: "payment_transactions", entityId: tx.id, details: { providerPaymentId: p.id, status: p.status, chargeback: p.chargeback?.status ?? null } });
  await notifyStaff([{ type: "payment.chargeback", category: "payments", severity: "critical", title: "Chargeback no Asaas", body: `Cobrança ${p.id} contestada (${formatCurrency((p.value ?? 0))}). Acompanhe no Asaas.`, url: "/admin/pagamentos", dedupeKey: `asaas:${tx.id}:chargeback` }], { db });
}

/**
 * Reconciliação: GET da cobrança e aplicação do estado atual. Usada pelo webhook, pelo "Atualizar status"
 * e para destravar tentativas "started" (procura por externalReference quando ainda não há ID do Asaas).
 */
export async function reconcileTx(db: SupabaseClient, cfg: AsaasConfigRow, tx: AsaasTx, actor: { type: "staff" | "client" | "system"; id?: string | null }) {
  const env = tx.environment ?? cfg.environment;
  const key = apiKeyFor(cfg, env);
  let payment: PaymentSnapshot | null = null;
  if (tx.provider_payment_id) payment = await asaasFetch<PaymentSnapshot>(env, key, "GET", `/payments/${encodeURIComponent(tx.provider_payment_id)}`);
  else {
    const found = await asaasFetch<{ data?: PaymentSnapshot[] }>(env, key, "GET", `/payments?externalReference=${encodeURIComponent(txReference(tx.id))}&limit=5`);
    payment = found.data?.find((x) => !x.deleted) ?? null;
    if (!payment) {
      // Confirmado que nada foi criado: libera para tentar de novo.
      await db.from("payment_transactions").update({ status: "failed", last_error: "Nenhuma cobrança encontrada no Asaas para esta tentativa." }).eq("id", tx.id).eq("status", "started");
      return loadTx(db, tx.id);
    }
  }
  return (await applySnapshot(db, tx.id, payment, actor)) ?? loadTx(db, tx.id);
}

/** QR Code Pix da cobrança (endpoint oficial). Não é persistido: é obtido sob demanda. */
export async function pixQrCode(cfg: AsaasConfigRow, tx: AsaasTx) {
  if (!tx.provider_payment_id) throw new HttpError(409, "Cobrança ainda sem identificação no Asaas.");
  const env = tx.environment ?? cfg.environment;
  const r = await asaasFetch<{ encodedImage?: string; payload?: string; expirationDate?: string }>(env, apiKeyFor(cfg, env), "GET", `/payments/${encodeURIComponent(tx.provider_payment_id)}/pixQrCode`);
  return { image: r.encodedImage ? `data:image/png;base64,${r.encodedImage}` : null, payload: r.payload ?? null, expirationDate: r.expirationDate ?? null };
}

/** Linha digitável/código de barras do boleto (endpoint oficial). */
export async function bankSlipLine(cfg: AsaasConfigRow, tx: AsaasTx) {
  if (!tx.provider_payment_id) throw new HttpError(409, "Cobrança ainda sem identificação no Asaas.");
  const env = tx.environment ?? cfg.environment;
  const r = await asaasFetch<{ identificationField?: string; barCode?: string; nossoNumero?: string }>(env, apiKeyFor(cfg, env), "GET", `/payments/${encodeURIComponent(tx.provider_payment_id)}/identificationField`);
  return { identificationField: r.identificationField ?? null, barCode: r.barCode ?? null };
}

/** DELETE no Asaas + marca cancelada. Só chamar com o estado já reconciliado (link_created). */
async function deleteCharge(db: SupabaseClient, cfg: AsaasConfigRow, fresh: AsaasTx) {
  const env = fresh.environment ?? cfg.environment;
  await asaasFetch(env, apiKeyFor(cfg, env), "DELETE", `/payments/${encodeURIComponent(fresh.provider_payment_id!)}`);
  await db.from("payment_transactions").update({ status: "cancelled", provider_status: "DELETED", provider_updated_at: new Date().toISOString() }).eq("id", fresh.id).eq("status", "link_created");
  return env;
}

/** Exclui (cancela) a cobrança no Asaas. Só cobranças não pagas. */
export async function cancelCharge(db: SupabaseClient, cfg: AsaasConfigRow, tx: AsaasTx, actor: { id: string; ip?: string | null }) {
  if (tx.status !== "link_created" && tx.status !== "started") throw new HttpError(409, "Só é possível cancelar cobranças em aberto.");
  const fresh = await reconcileTx(db, cfg, tx, { type: "staff", id: actor.id });
  if (fresh.status !== "link_created") throw new HttpError(409, fresh.status === "failed" ? "Esta tentativa não chegou a ser criada no Asaas." : "A cobrança mudou de status no Asaas e não pode ser cancelada.");
  const env = await deleteCharge(db, cfg, fresh);
  await audit({ actorType: "staff", actorId: actor.id, action: "asaas_charge_cancelled", entity: "payment_transactions", entityId: tx.id, details: { providerPaymentId: fresh.provider_payment_id, environment: env }, ip: actor.ip ?? null });
}

/**
 * Parcela quitada/cancelada/removida por outro meio (baixa manual, comprovante, InfinitePay): cancela a cobrança
 * Asaas que ficou aberta, para o cliente não pagar duas vezes. O estado da parcela é lido do banco (nunca do navegador).
 * Nunca lança: falha vira last_error na tentativa e aviso para a equipe, sem desfazer a baixa que já aconteceu.
 */
export async function releaseChargeIfSettled(db: SupabaseClient, rentalId: string, receiptId: string, actor: { type: "staff" | "system"; id?: string | null }, reason: string) {
  try {
    const active = await activeCharge(db, rentalId, receiptId);
    if (!active) return "none";
    const { data: row } = await db.from("rentals").select("receipts").eq("id", rentalId).maybeSingle();
    const receipt = ((row?.receipts as Rental["receipts"] | undefined) ?? []).find((r) => r.id === receiptId);
    if (receipt && !receipt.paid && !receipt.cancelled) return "open";
    const cfg = await loadAsaasConfig(db);
    if (!cfg) return "none";
    // Mesmo com a integração desativada: a cobrança antiga continua pagável e precisa ser encerrada.
    const fresh = await reconcileTx(db, cfg, active, actor);
    if (fresh.status !== "link_created") return fresh.status; // já paga/cancelada no Asaas: reconcileTx registrou
    const env = await deleteCharge(db, cfg, fresh);
    await audit({ actorType: actor.type, actorId: actor.id ?? null, action: "asaas_charge_auto_cancelled", entity: "payment_transactions", entityId: active.id, details: { rentalId, receiptId, reason, providerPaymentId: fresh.provider_payment_id, environment: env } });
    log("charge_auto_cancelled", { tx: active.id, reason });
    return "cancelled";
  } catch (e) {
    const message = `Parcela baixada (${reason}), mas a cobrança Asaas não foi cancelada automaticamente: ${e instanceof Error ? e.message : "erro"}. Cancele em Pagamentos → Mais → Ver cobrança Asaas.`;
    console.error("[asaas] auto-cancel:", redact(message));
    const { data: open } = await db.from("payment_transactions").select("id").eq("provider", "asaas").eq("rental_id", rentalId).eq("receipt_id", receiptId).in("status", ["started", "link_created"]).maybeSingle();
    if (open) {
      await db.from("payment_transactions").update({ last_error: message.slice(0, 300) }).eq("id", open.id);
      await notifyStaff([{ type: "payment.asaas_cancel_failed", category: "payments", severity: "warning", title: "Cancele a cobrança Asaas", body: "A parcela foi paga por outro meio, mas a cobrança Asaas continua aberta.", url: "/admin/pagamentos", dedupeKey: `asaas:${open.id}:autocancel` }], { db });
    }
    return "error";
  }
}

/** Mantém valor/vencimento iguais no Asaas quando a parcela é editada no LOCAKAR. Só cobranças em aberto. */
export async function syncChargeWithReceipt(db: SupabaseClient, cfg: AsaasConfigRow, tx: AsaasTx, actor: { id: string; ip?: string | null }) {
  const fresh = await reconcileTx(db, cfg, tx, { type: "staff", id: actor.id });
  if (fresh.status !== "link_created" || !fresh.provider_payment_id) throw new HttpError(409, "Só cobranças em aberto podem ser atualizadas.");
  const { receipt, cents } = await openReceipt(db, fresh.rental_id, fresh.receipt_id);
  const today = todaySP();
  const dueDate = receipt.dueDate < today ? today : receipt.dueDate;
  const env = fresh.environment ?? cfg.environment;
  const p = await asaasFetch<PaymentSnapshot>(env, apiKeyFor(cfg, env), "PUT", `/payments/${encodeURIComponent(fresh.provider_payment_id)}`, { billingType: fresh.billing_type ?? "UNDEFINED", value: cents / 100, dueDate });
  await db.from("payment_transactions").update({ amount_cents: cents }).eq("id", tx.id);
  await applySnapshot(db, tx.id, p, { type: "staff", id: actor.id });
  await audit({ actorType: "staff", actorId: actor.id, action: "asaas_charge_updated", entity: "payment_transactions", entityId: tx.id, details: { amountCents: cents, dueDate }, ip: actor.ip ?? null });
  return loadTx(db, tx.id);
}

export { ASAAS_WEBHOOK_EVENTS };
