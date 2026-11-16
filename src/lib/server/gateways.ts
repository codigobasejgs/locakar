import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/gateway-signature";
import {
  GATEWAYS,
  GATEWAY_API,
  credentialProblem,
  decideGateway,
  gatewayMethodLabel,
  linkFromResponse,
  mercadoPagoPreference,
  pagBankCheckout,
  pagarmeLink,
  readMercadoPagoPayment,
  readPagBankOrder,
  readPagarmeOrder,
  type GatewayEnv,
  type GatewayId,
  type PaidInfo,
} from "@/lib/gateways";
import { methodStatus, type PaymentMethodState } from "@/lib/payment-methods";
import { confirmPaid, openReceipt } from "@/lib/server/infinitepay";
import { requireOrg, siteUrl } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { decrypt, encrypt, hasSecretKey } from "@/lib/server/secret";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { formatDate } from "@/lib/utils";

/**
 * Mercado Pago, PagBank e Pagar.me (Stone): credenciais cifradas por locadora, criação do link,
 * consulta ao gateway (fonte da verdade) e baixa idempotente (mesma confirmPaid da InfinitePay).
 */
const KEY = "ASAAS_ENCRYPTION_KEY"; // mesma chave mestra dos segredos de pagamento já configurada na Vercel
export const hasGatewayKey = () => hasSecretKey(KEY);

export interface GatewayRow {
  provider: GatewayId;
  enabled: boolean;
  environment: GatewayEnv;
  credential_enc: string | null;
  credential_last4: string | null;
  webhook_secret_enc: string | null;
  verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export async function loadGateways(db: SupabaseClient): Promise<Partial<Record<GatewayId, GatewayRow>>> {
  const { data, error } = await db.from("payment_gateways").select("provider,enabled,environment,credential_enc,credential_last4,webhook_secret_enc,verified_at,last_error,updated_at");
  if (error) return {}; // migration ainda não aplicada: gateways aparecem como "não configurado"
  return Object.fromEntries((data ?? []).map((r) => [r.provider, r as GatewayRow]));
}

/** Pronto para cobrar: credencial testada e, no Mercado Pago, assinatura secreta do webhook. */
export function gatewayState(id: GatewayId, row?: GatewayRow | null): PaymentMethodState {
  const cred = Boolean(row?.credential_enc && row.verified_at);
  const needsSecret = id === "mercadopago" || id === "pagarme";
  const configured = cred && (!needsSecret || Boolean(row?.webhook_secret_enc));
  const detail = !row?.credential_enc
    ? `Salve o ${GATEWAYS[id].credential}.`
    : !row.verified_at
      ? "Teste a conexão de novo."
      : needsSecret && !row.webhook_secret_enc
        ? id === "mercadopago" ? "Informe a assinatura secreta do webhook." : "Gere a URL do webhook."
        : undefined;
  const enabled = Boolean(row?.enabled);
  return { id, enabled, configured, status: methodStatus(enabled, configured, row?.credential_enc ? (row.last_error ?? null) : null), detail };
}

const secretOf = (row: GatewayRow) => {
  if (!row.credential_enc) throw new HttpError(409, `Configure o ${GATEWAYS[row.provider].label} em Configurações → Pagamentos.`);
  return decrypt(row.credential_enc, KEY);
};

const authHeaders = (id: GatewayId, secret: string): Record<string, string> =>
  id === "pagarme" ? { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}` } : { Authorization: `Bearer ${secret}` };

async function call<T = Record<string, unknown>>(id: GatewayId, env: GatewayEnv, secret: string, path: string, init: { method?: string; body?: unknown; idempotency?: string } = {}) {
  let res: Response;
  // Pagar.me: o host de testes (sdx-api) só tem /paymentlinks; pedidos ficam em api.pagar.me (aceita sk_test).
  const base = id === "pagarme" && !path.startsWith("/paymentlinks") ? GATEWAY_API.pagarme.production : GATEWAY_API[id][env];
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...authHeaders(id, secret),
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.idempotency && id === "mercadopago" ? { "X-Idempotency-Key": init.idempotency } : {}),
        "User-Agent": "LocaKar/1.0",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, `${GATEWAYS[id].label} não respondeu. Tente de novo.`);
  }
  const json = (await res.json().catch(() => ({}))) as T & Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.error_messages ?? json.errors) as unknown;
    const first = Array.isArray(errs) ? (errs[0] as Record<string, unknown>) : null;
    const msg = String(json.message ?? first?.description ?? first?.message ?? json.error ?? "").slice(0, 200);
    if (res.status === 401 || res.status === 403) throw new HttpError(409, `${GATEWAYS[id].label}: credencial recusada (${res.status}). Confira o ${GATEWAYS[id].credential} e o ambiente.`);
    throw new HttpError(502, `${GATEWAYS[id].label} respondeu HTTP ${res.status}${msg ? `: ${msg}` : ""}.`);
  }
  return json;
}

/** Testa a credencial com uma leitura simples (nada é criado no gateway). */
async function ping(id: GatewayId, env: GatewayEnv, secret: string) {
  if (id === "mercadopago") await call(id, env, secret, "/users/me");
  // PagBank não tem endpoint "quem sou eu": consulta um pedido inexistente. Token aceito = 404/400; recusado = 401/403.
  if (id === "pagbank") await call(id, env, secret, "/orders/ORDE_00000000-0000-0000-0000-000000000000").catch((e) => {
    if (!(e instanceof HttpError) || e.status !== 502 || !/HTTP (400|404)/.test(e.message)) throw e;
  });
  if (id === "pagarme") await call(id, env, secret, "/orders?size=1");
}

/** Salva/testa a configuração. Credencial em branco mantém a atual (nunca volta ao navegador). */
export async function saveGateway(
  db: SupabaseClient,
  id: GatewayId,
  input: { environment: GatewayEnv; credential?: string; webhookSecret?: string; regenerateToken?: boolean },
  actor: { id: string; ip?: string | null },
) {
  if (!hasGatewayKey()) throw new HttpError(409, "Configure ASAAS_ENCRYPTION_KEY (chave mestra dos segredos de pagamento) na Vercel.");
  const rows = await loadGateways(db);
  const row = rows[id];
  const credential = input.credential?.trim();
  if (credential) {
    const problem = credentialProblem(id, input.environment, credential);
    if (problem) throw new HttpError(422, problem);
  }
  const secret = credential || (row?.credential_enc && row.environment === input.environment ? decrypt(row.credential_enc, KEY) : null);
  if (!secret) throw new HttpError(422, `Informe o ${GATEWAYS[id].credential} do ambiente ${input.environment === "sandbox" ? "de testes" : "de produção"}.`);

  const patch: Record<string, unknown> = { provider: id, environment: input.environment, updated_by: actor.id, updated_at: new Date().toISOString() };
  if (credential) Object.assign(patch, { credential_enc: encrypt(credential, KEY), credential_last4: credential.slice(-4) });
  if (id === "mercadopago" && input.webhookSecret?.trim()) {
    const s = input.webhookSecret.trim();
    if (!/^[A-Za-z0-9]{16,128}$/.test(s)) throw new HttpError(422, "Assinatura secreta inválida (copie de Suas integrações → Webhooks).");
    patch.webhook_secret_enc = encrypt(s, KEY);
  }
  let token: string | null = null;
  if (id === "pagarme" && (input.regenerateToken || !row?.webhook_secret_enc)) {
    token = randomBytes(24).toString("base64url");
    patch.webhook_secret_enc = encrypt(token, KEY);
  }
  try {
    await ping(id, input.environment, secret);
    Object.assign(patch, { verified_at: new Date().toISOString(), last_error: null });
  } catch (e) {
    Object.assign(patch, { verified_at: null, last_error: (e as Error).message.slice(0, 300) });
  }
  const { error } = await db.from("payment_gateways").upsert(patch, { onConflict: "organization_id,provider" });
  if (error) throw new HttpError(503, "Aplique a migration 20261025000000_payment_gateways.sql no Supabase.");
  await audit({ actorType: "staff", actorId: actor.id, action: "payment_gateway.saved", entity: "payment_gateways", entityId: id, details: { environment: input.environment, credential: Boolean(credential), ok: !patch.last_error }, ip: actor.ip ?? null });
  if (patch.last_error) throw new HttpError(409, String(patch.last_error));
}

export async function setGatewayEnabled(db: SupabaseClient, id: GatewayId, enabled: boolean) {
  const row = (await loadGateways(db))[id];
  if (enabled && !gatewayState(id, row).configured) throw new HttpError(409, `Configure este meio de pagamento antes de ativá-lo. ${gatewayState(id, row).detail ?? ""}`.trim());
  if (!row) return;
  const { error } = await db.from("payment_gateways").update({ enabled, updated_at: new Date().toISOString() }).eq("provider", id);
  if (error) throw new HttpError(500, "Não foi possível salvar.");
}

/** URL de webhook de cada gateway. Pagar.me leva o token (o dashboard não assina as chamadas). */
export function webhookUrlFor(id: GatewayId, row?: GatewayRow | null) {
  const base = `${siteUrl()}/api/webhooks/gateways/${id}?o=${requireOrg().org.id}`;
  if (id === "pagarme" && row?.webhook_secret_enc) return `${base}&t=${decrypt(row.webhook_secret_enc, KEY)}`;
  return base;
}
export const returnUrlFor = (id: GatewayId, txId: string) => `${siteUrl()}/pagamento/retorno?g=${id}&ref=${txId}`;

/** Status para o painel (sem segredos). */
export async function gatewayPanel(db: SupabaseClient) {
  const rows = await loadGateways(db);
  return Promise.all(
    (Object.keys(GATEWAYS) as GatewayId[]).map(async (id) => {
      const row = rows[id];
      const { data: last } = await db.from("payment_transactions").select("status,amount_cents,created_at,last_error").eq("provider", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return {
        id,
        state: gatewayState(id, row),
        environment: row?.environment ?? "sandbox",
        credentialLast4: row?.credential_last4 ?? null,
        hasWebhookSecret: Boolean(row?.webhook_secret_enc),
        verifiedAt: row?.verified_at ?? null,
        lastError: row?.last_error ?? null,
        webhookUrl: row ? webhookUrlFor(id, row) : null,
        lastTransaction: last ?? null,
      };
    }),
  );
}

/**
 * Link de pagamento de uma parcela. Valor e cliente sempre do servidor; reaproveita o link aberto do mesmo valor.
 * clientId (app/WhatsApp) obriga a parcela a ser do próprio cliente.
 */
export async function createGatewayLink(
  db: SupabaseClient,
  id: GatewayId,
  p: { rentalId: unknown; receiptId: unknown; clientId?: string; operatorId?: string | null; actor: { type: "staff" | "client"; id?: string | null; ip?: string | null } },
) {
  const row = (await loadGateways(db))[id];
  const state = gatewayState(id, row);
  if (!state.enabled || !state.configured || !row) throw new HttpError(409, `${GATEWAYS[id].label} está desativado para novas cobranças.`);
  const { rental, receipt, index, cents, client, vehicle } = await openReceipt(db, p.rentalId, p.receiptId);
  if (p.clientId && rental.clientId !== p.clientId) throw new HttpError(404, "Parcela não encontrada.");

  const { data: open } = await db.from("payment_transactions").select("id,checkout_url,created_at")
    .eq("provider", id).eq("rental_id", rental.id).eq("receipt_id", receipt.id).eq("status", "link_created").eq("amount_cents", cents)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  // Links valem 3 dias; reaproveita só se ainda faltar pelo menos 1 dia.
  if (open?.checkout_url && Date.now() - new Date(open.created_at as string).getTime() < 2 * 86_400_000) {
    return { id: open.id as string, url: open.checkout_url as string, amountCents: cents, reused: true };
  }

  const { data: tx, error } = await db.from("payment_transactions")
    .insert({ provider: id, flow: "checkout", rental_id: rental.id, receipt_id: receipt.id, client_id: rental.clientId, amount_cents: cents, environment: row.environment, operator_id: p.operatorId ?? null, device: p.actor.type === "client" ? "app-locatario" : null })
    .select("id").single();
  if (error) throw new HttpError(500, "Não foi possível registrar a cobrança.");

  const input = {
    txId: tx.id as string,
    cents,
    title: `Aluguel ${vehicle?.plate ?? ""} - parcela ${index + 1} - venc. ${formatDate(receipt.dueDate)}`.replace(/\s+/g, " "),
    customer: { name: client?.name, email: client?.email, phone: client?.phone, cpf: client?.cpf },
    returnUrl: returnUrlFor(id, tx.id as string),
    notifyUrl: webhookUrlFor(id, row),
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "-00:00"),
  };
  try {
    const secret = secretOf(row);
    const body = id === "mercadopago" ? mercadoPagoPreference(input) : id === "pagbank" ? pagBankCheckout(input) : pagarmeLink(input);
    const path = id === "mercadopago" ? "/checkout/preferences" : id === "pagbank" ? "/checkouts" : "/paymentlinks";
    const res = await call(id, row.environment, secret, path, { method: "POST", body, idempotency: tx.id as string });
    const link = linkFromResponse(id, row.environment, res);
    if (!link) throw new HttpError(502, `${GATEWAYS[id].label} não devolveu o link de pagamento.`);
    await db.from("payment_transactions").update({ status: "link_created", checkout_url: link.url, invoice_slug: link.providerId, external_reference: tx.id }).eq("id", tx.id);
    await audit({ actorType: p.actor.type, actorId: p.actor.id ?? null, action: `${id}_payment_created`, entity: "payment_transactions", entityId: tx.id, details: { rentalId: rental.id, receiptId: receipt.id, amountCents: cents, via: p.actor.type === "client" ? "app" : "painel" }, ip: p.actor.ip ?? null });
    return { id: tx.id as string, url: link.url, amountCents: cents, reused: false };
  } catch (e) {
    const message = (e as Error).message;
    await db.from("payment_transactions").update({ status: "failed", last_error: message.slice(0, 300) }).eq("id", tx.id);
    throw e instanceof HttpError ? e : new HttpError(502, message);
  }
}

/** Consulta o pagamento no gateway. `hint` = id que veio no webhook/retorno (pagamento MP, pedido PagBank). */
async function fetchPaid(id: GatewayId, row: GatewayRow, tx: { id: string; invoice_slug: string | null; provider_payment_id: string | null }, hint?: string | null): Promise<PaidInfo | null> {
  const secret = secretOf(row);
  const env = row.environment;
  if (id === "mercadopago") {
    const pid = hint ?? tx.provider_payment_id;
    if (pid) {
      if (!/^\d{1,20}$/.test(pid)) return null;
      return readMercadoPagoPayment(await call(id, env, secret, `/v1/payments/${pid}`));
    }
    // Sem id do pagamento (retorno perdido): procura pelo external_reference.
    const r = await call<{ results?: Record<string, unknown>[] }>(id, env, secret, `/v1/payments/search?external_reference=${encodeURIComponent(tx.id)}&sort=date_created&criteria=desc`);
    const list = (r.results ?? []).map(readMercadoPagoPayment);
    return list.find((x) => x.paid) ?? list[0] ?? null;
  }
  if (id === "pagbank") {
    const orderId = hint && /^ORDE_[A-Za-z0-9-]{8,64}$/.test(hint) ? hint : tx.provider_payment_id && /^ORDE_/.test(tx.provider_payment_id) ? tx.provider_payment_id : null;
    if (orderId) return readPagBankOrder(await call(id, env, secret, `/orders/${orderId}`));
    // Consulta o checkout: os pedidos gerados por ele vêm em "orders".
    if (!tx.invoice_slug) return null;
    const ck = await call<{ orders?: { id?: string }[] }>(id, env, secret, `/checkouts/${tx.invoice_slug}`);
    for (const o of ck.orders ?? []) {
      if (typeof o.id !== "string" || !/^ORDE_/.test(o.id)) continue;
      const info = readPagBankOrder(await call(id, env, secret, `/orders/${o.id}`));
      if (info.paid) return info;
    }
    return null;
  }
  const orderId = hint && /^or_[A-Za-z0-9]{8,40}$/.test(hint) ? hint : tx.provider_payment_id && /^or_/.test(tx.provider_payment_id) ? tx.provider_payment_id : null;
  if (orderId) return readPagarmeOrder(await call(id, env, secret, `/orders/${orderId}`));
  const r = await call<{ data?: Record<string, unknown>[] }>(id, env, secret, `/orders?code=${encodeURIComponent(tx.id)}&size=10`);
  const list = (r.data ?? []).map(readPagarmeOrder);
  return list.find((x) => x.paid) ?? list[0] ?? null;
}

/** Pagamento do Mercado Pago pelo id (webhook sem tentativa conhecida: descobre a external_reference). */
export async function gatewayFetchPayment(id: "mercadopago", paymentId: string) {
  const row = (await loadGateways(serviceDb()))[id];
  if (!row || !/^\d{1,20}$/.test(paymentId)) throw new HttpError(404, "Pagamento não encontrado.");
  return call(id, row.environment, secretOf(row), `/v1/payments/${paymentId}`);
}

const TX_COLS ="id,provider,flow,rental_id,receipt_id,client_id,amount_cents,method,installments,status,invoice_slug,provider_payment_id";

/** Fonte da verdade: consulta o gateway e baixa a parcela uma única vez. Usado por webhook, retorno e "verificar". */
export async function reconcileGateway(db: SupabaseClient, id: GatewayId, txId: string, hint?: string | null, actor: { type: "staff" | "system"; id?: string | null } = { type: "system" }) {
  if (!/^[0-9a-f-]{36}$/i.test(txId)) return "unknown" as const;
  const { data: tx } = await db.from("payment_transactions").select(TX_COLS).eq("id", txId).eq("provider", id).maybeSingle();
  if (!tx) return "unknown" as const;
  if (tx.status === "paid") return "already" as const;
  const row = (await loadGateways(db))[id];
  if (!row?.credential_enc) return "pending" as const;
  const info = await fetchPaid(id, row, tx, hint);
  const decision = decideGateway(tx, info);
  if (decision === "paid" && info) {
    const done = await confirmPaid(
      db,
      tx,
      { paidCents: info.cents, method: info.method === "debit" ? "debit" : info.method, installments: info.installments, providerPaymentId: info.paymentId ?? undefined },
      actor,
      { name: GATEWAYS[id].label.replace(/ \(.*\)$/, ""), label: gatewayMethodLabel(id, info.method, info.installments), event: id },
    );
    return done ? ("paid" as const) : ("already" as const);
  }
  if (decision === "mismatch") {
    await db.from("payment_transactions").update({ status: "amount_mismatch", last_error: `Valor pago ${info?.cents} menor que o cobrado ${tx.amount_cents}` }).eq("id", tx.id).neq("status", "paid");
  }
  if (decision === "foreign") return "pending" as const;
  return decision;
}

/** Cancela o link (só no LocaKar: o link expira sozinho em 3 dias; pagamento tardio ainda baixa se a parcela estiver aberta). */
export async function cancelGatewayTx(db: SupabaseClient, txId: unknown, actor: { id: string; ip?: string | null }) {
  if (typeof txId !== "string" || !/^[0-9a-f-]{36}$/i.test(txId)) throw new HttpError(400, "Transação inválida.");
  const { data } = await db.from("payment_transactions").update({ status: "cancelled" }).eq("id", txId).in("provider", Object.keys(GATEWAYS)).in("status", ["started", "link_created", "failed"]).select("id,provider").maybeSingle();
  if (!data) throw new HttpError(409, "Esta cobrança não pode ser cancelada.");
  await audit({ actorType: "staff", actorId: actor.id, action: `${data.provider}_payment_cancelled`, entity: "payment_transactions", entityId: txId, ip: actor.ip ?? null });
}

export const tokenHashFor = sha256Hex;
export { decrypt as decryptGatewaySecret };
export const gatewayKeyName = KEY;
