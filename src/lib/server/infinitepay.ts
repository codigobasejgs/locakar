import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { billingOf, lateCharges } from "@/lib/billing";
import { COMPANY } from "@/lib/company";
import { HttpError } from "@/lib/server/supabase";
import { INFINITEPAY_API, checkoutPayload, decideCheckout, isValidOrderId, methodLabel, toCents, type CheckoutWebhook, type PaymentCheck, type TransactionFlow } from "@/lib/infinitepay";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { notifyStaff, sendPushToClient } from "@/lib/server/push";
import { audit } from "@/lib/server/tenant";
import { formatCurrency, formatDate, todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";

/**
 * Chamadas HTTP à InfinitePay e a baixa da parcela. A documentação atual do Checkout Integrado
 * não exige API key: a conta é identificada pela InfiniteTag (handle). Nada de segredo sai daqui.
 */

const log = (event: string, extra: Record<string, unknown> = {}) => console.info(`[infinitepay] ${event}`, extra);

async function post<T>(path: "links" | "payment_check", body: unknown): Promise<{ ok: boolean; status: number; json: T & { message?: string; error?: string } }> {
  const res = await fetch(`${INFINITEPAY_API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  return { ok: res.ok, status: res.status, json };
}

/** Procura a URL do checkout na resposta. A documentação não publica o nome do campo, então aceitamos só URLs https da InfinitePay. */
function findCheckoutUrl(json: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string | null => {
    if (typeof v === "string") return /^https:\/\/([a-z0-9-]+\.)*infinitepay\.io\//i.test(v) ? v : null;
    if (!v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    for (const key of ["url", "checkout_url", "link", "payment_url"]) {
      const hit = walk((v as Record<string, unknown>)[key]);
      if (hit) return hit;
    }
    for (const x of Object.values(v as Record<string, unknown>)) {
      const hit = walk(x);
      if (hit) return hit;
    }
    return null;
  };
  return walk(json);
}

export async function createCheckoutLink(payload: Record<string, unknown>) {
  const { ok, status, json } = await post<Record<string, unknown>>("links", payload);
  if (!ok) {
    const msg =
      json.error === "external_checkout_not_enabled"
        ? "Checkout integrado desativado na conta InfinitePay. Ative em app.infinitepay.io → Checkout externo → Configurações."
        : json.message || `InfinitePay respondeu HTTP ${status}.`;
    log("infinitepay_payment_failed", { step: "links", status, error: json.error });
    throw new Error(msg);
  }
  const url = findCheckoutUrl(json);
  if (!url) {
    log("infinitepay_payment_failed", { step: "links", status, reason: "sem URL na resposta", keys: Object.keys(json) });
    throw new Error("A InfinitePay não devolveu o link do checkout. Tente de novo.");
  }
  return { url, slug: typeof json.slug === "string" ? json.slug : null };
}

export async function paymentCheck(body: { handle: string; order_nsu: string; transaction_nsu: string; slug: string }): Promise<PaymentCheck> {
  const { ok, json } = await post<PaymentCheck>("payment_check", body);
  if (!ok) return { success: false, paid: false };
  return json;
}

interface TxRow {
  id: string;
  flow: TransactionFlow;
  rental_id: string;
  receipt_id: string;
  client_id: string;
  amount_cents: number;
  method: string | null;
  installments: number | null;
  status: string;
}

/**
 * Quita a parcela ligada à tentativa. Atômico: a tentativa só vira "paid" uma vez (update condicional
 * + índice único por parcela), então webhook repetido, payment_check e baixa manual não duplicam receita.
 * Retorna false se outra chamada já confirmou.
 */
export async function confirmPaid(
  db: SupabaseClient,
  tx: TxRow,
  data: { paidCents: number; method?: string | null; installments?: number | null; transactionNsu?: string; slug?: string; receiptUrl?: string; captureMethod?: string },
  actor: { type: "staff" | "system"; id?: string | null; ip?: string | null },
) {
  const now = new Date().toISOString();
  const { data: won, error } = await db
    .from("payment_transactions")
    .update({
      status: "paid",
      paid_at: now,
      paid_amount_cents: data.paidCents,
      ...(data.method ? { method: data.method } : {}),
      ...(data.installments ? { installments: data.installments } : {}),
      ...(data.transactionNsu ? { transaction_nsu: data.transactionNsu } : {}),
      ...(data.slug ? { invoice_slug: data.slug } : {}),
      ...(data.receiptUrl ? { receipt_url: data.receiptUrl } : {}),
      ...(data.captureMethod ? { capture_method: data.captureMethod } : {}),
      last_error: null,
    })
    .eq("id", tx.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();
  // 23505: outra tentativa já quitou esta parcela ou o transaction_nsu já foi usado.
  if (error?.code === "23505") {
    log("infinitepay_webhook_duplicate", { tx: tx.id });
    return false;
  }
  if (error) throw new Error(error.message);
  if (!won) return false;

  const [{ data: rentalRow }, { data: client }] = await Promise.all([
    db.from("rentals").select("*").eq("id", tx.rental_id).maybeSingle(),
    db.from("clients").select("id,name,email").eq("id", tx.client_id).maybeSingle(),
  ]);
  const rental = rentalRow ? fromRow<Rental>(rentalRow) : null;
  const index = rental ? rental.receipts.findIndex((r) => r.id === tx.receipt_id) : -1;
  const label = methodLabel(tx.flow, data.method ?? tx.method, data.installments ?? tx.installments);
  const amount = data.paidCents / 100;
  const ref = [data.transactionNsu && `NSU ${data.transactionNsu}`, data.receiptUrl && `Comprovante: ${data.receiptUrl}`].filter(Boolean).join(" · ");

  if (rental && index >= 0 && !rental.receipts[index].paid) {
    const receipts = rental.receipts.map((r) =>
      r.id === tx.receipt_id
        ? { ...r, paid: true, paidAt: todaySP(), amountPaid: amount, paymentMethod: label, notes: [r.notes, ref].filter(Boolean).join(" · ") || undefined, settledBy: "InfinitePay" }
        : r,
    );
    await db.from("rentals").update({ receipts, updated_at: now }).eq("id", rental.id);
  }
  // Cobrança Asaas aberta desta parcela é cancelada (import dinâmico: asaas.ts já importa este módulo).
  await (await import("@/lib/server/asaas")).releaseChargeIfSettled(db, tx.rental_id, tx.receipt_id, { type: actor.type === "staff" ? "staff" : "system", id: actor.id }, "InfinitePay");

  await audit({ actorType: actor.type, actorId: actor.id ?? null, action: "infinitepay_payment_confirmed", entity: "payment_transactions", entityId: tx.id, details: { rentalId: tx.rental_id, receiptId: tx.receipt_id, amountCents: data.paidCents, flow: tx.flow, method: label, transactionNsu: data.transactionNsu ?? null }, ip: actor.ip ?? null });
  log("infinitepay_payment_confirmed", { tx: tx.id, flow: tx.flow });

  await Promise.all([
    notifyStaff([
      {
        type: "payment.received",
        category: "payments",
        severity: "success",
        title: "Pagamento InfinitePay confirmado",
        body: `${client?.name ?? "Cliente"} · ${formatCurrency(amount)} · ${label}`,
        url: "/admin/pagamentos",
        dedupeKey: `infinitepay:${tx.id}:paid`,
      },
    ], { db }),
    client
      ? sendPushToClient(client.id, { title: "Pagamento confirmado", body: `Recebemos ${formatCurrency(amount)} (${label}).`, url: "/", severity: "success", tag: `ip-${tx.id}` }, "pagamentos")
      : null,
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
              ["Forma", label],
              ...(data.transactionNsu ? ([["NSU", data.transactionNsu]] as [string, string][]) : []),
            ],
            ...(data.receiptUrl ? { cta: { label: "Ver comprovante InfinitePay", url: data.receiptUrl } } : {}),
          }),
        }).catch((e) => console.error("[infinitepay] e-mail:", (e as Error).message))
      : null,
  ]);
  return true;
}

/**
 * Confirma uma cobrança do Checkout consultando o payment_check (fonte da verdade). Usado pelo webhook
 * e pela página de retorno. Os identificadores só são gravados depois que a InfinitePay confirma.
 */
export async function reconcileCheckout(
  db: SupabaseClient,
  input: { orderNsu: string; transactionNsu: string; slug: string; receiptUrl?: string },
): Promise<"paid" | "already" | "mismatch" | "pending" | "unknown"> {
  if (!isValidOrderId(input.orderNsu) || !input.transactionNsu || !input.slug) return "unknown";
  const { data: tx } = await db.from("payment_transactions").select("*").eq("id", input.orderNsu).eq("provider", "infinitepay").eq("flow", "checkout").maybeSingle();
  if (!tx) return "unknown";
  if (tx.status === "paid") return "already";
  const check = await paymentCheck({ handle: tx.handle, order_nsu: tx.id, transaction_nsu: input.transactionNsu, slug: input.slug });
  const decision = decideCheckout(tx, check);
  if (decision === "paid") {
    const receiptUrl = input.receiptUrl && /^https:\/\//.test(input.receiptUrl) ? input.receiptUrl : undefined;
    const done = await confirmPaid(
      db,
      tx,
      { paidCents: check.paid_amount ?? check.amount ?? tx.amount_cents, method: check.capture_method, installments: check.installments, transactionNsu: input.transactionNsu, slug: input.slug, receiptUrl, captureMethod: check.capture_method },
      { type: "system" },
    );
    return done ? "paid" : "already";
  }
  if (decision === "mismatch") {
    await db.from("payment_transactions").update({ status: "amount_mismatch", last_error: `Valor pago ${check.amount} menor que o cobrado ${tx.amount_cents}` }).eq("id", tx.id).neq("status", "paid");
  }
  return decision;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || COMPANY.siteUrl).replace(/\/+$/, "");

/** Parcela em aberto + valor atualizado em centavos, calculados aqui (nunca vindos do navegador/app). */
export async function openReceipt(db: SupabaseClient, rentalId: unknown, receiptId: unknown) {
  if (typeof rentalId !== "string" || typeof receiptId !== "string") throw new HttpError(400, "Parcela não informada.");
  const { data: row } = await db.from("rentals").select("*").eq("id", rentalId).maybeSingle();
  if (!row) throw new HttpError(404, "Locação não encontrada.");
  const rental = fromRow<Rental>(row);
  const index = rental.receipts.findIndex((r) => r.id === receiptId);
  const receipt = rental.receipts[index];
  if (!receipt) throw new HttpError(404, "Parcela não encontrada.");
  if (receipt.paid) throw new HttpError(409, "Esta parcela já está paga.");
  if (receipt.cancelled) throw new HttpError(409, "Esta parcela está cancelada.");
  const today = todaySP();
  const total = receipt.dueDate < today ? lateCharges(receipt.amount, receipt.dueDate, today, billingOf(rental)).total : receipt.amount;
  const cents = toCents(total);
  if (!(cents >= 100)) throw new HttpError(422, "O valor mínimo da cobrança é R$ 1,00.");
  const [{ data: client }, { data: vehicle }] = await Promise.all([
    db.from("clients").select("id,name,email,phone,cpf").eq("id", rental.clientId).maybeSingle(),
    db.from("vehicles").select("name,plate").eq("id", rental.vehicleId).maybeSingle(),
  ]);
  return { rental, receipt, index, cents, client, vehicle };
}

/**
 * Link do Checkout para uma parcela (painel ou app). Reaproveita o link aberto do mesmo valor,
 * senão cria a tentativa (order_nsu = id) com token próprio no webhook. Lança HttpError com mensagem amigável.
 */
export async function createReceiptCheckout(
  db: SupabaseClient,
  p: { handle: string; rentalId: unknown; receiptId: unknown; operatorId?: string | null; clientId?: string; actor: { type: "staff" | "client"; id?: string | null; ip?: string | null } },
) {
  const { rental, receipt, index, cents, client, vehicle } = await openReceipt(db, p.rentalId, p.receiptId);
  // App: a parcela precisa ser do próprio cliente (nunca confia no id enviado).
  if (p.clientId && rental.clientId !== p.clientId) throw new HttpError(404, "Parcela não encontrada.");

  const { data: existing } = await db
    .from("payment_transactions")
    .select("id,checkout_url")
    .eq("rental_id", rental.id)
    .eq("receipt_id", receipt.id)
    .eq("flow", "checkout")
    .eq("status", "link_created")
    .eq("amount_cents", cents)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.checkout_url) return { id: existing.id as string, url: existing.checkout_url as string, amountCents: cents, reused: true };

  const token = randomBytes(24).toString("base64url");
  const { data: tx, error } = await db
    .from("payment_transactions")
    .insert({
      flow: "checkout",
      rental_id: rental.id,
      receipt_id: receipt.id,
      client_id: rental.clientId,
      amount_cents: cents,
      handle: p.handle,
      webhook_token: token,
      operator_id: p.operatorId ?? null,
      device: p.actor.type === "client" ? "app-locatario" : null,
    })
    .select("id")
    .single();
  if (error) throw new HttpError(500, "Não foi possível registrar a cobrança.");
  const period = `${formatDate(rental.startDate)} a ${formatDate(rental.endDate)}`;
  try {
    const link = await createCheckoutLink(
      checkoutPayload({
        handle: p.handle,
        orderNsu: tx.id,
        items: [{ quantity: 1, price: cents, description: `Aluguel ${vehicle?.plate ?? ""} - parcela ${index + 1} - ${period}`.replace(/\s+/g, " ") }],
        redirectUrl: `${siteUrl()}/pagamento/infinitepay`,
        webhookUrl: webhookUrl(siteUrl(), tx.id, token),
        customer: { name: client?.name, email: client?.email ?? undefined, phone: client?.phone ?? undefined },
      }),
    );
    await db.from("payment_transactions").update({ status: "link_created", checkout_url: link.url, invoice_slug: link.slug }).eq("id", tx.id);
    await audit({ actorType: p.actor.type, actorId: p.actor.id ?? null, action: "infinitepay_payment_created", entity: "payment_transactions", entityId: tx.id, details: { flow: "checkout", rentalId: rental.id, receiptId: receipt.id, amountCents: cents, via: p.actor.type === "client" ? "app" : "painel" }, ip: p.actor.ip ?? null });
    return { id: tx.id as string, url: link.url, amountCents: cents, reused: false };
  } catch (e) {
    const message = (e as Error).message;
    await db.from("payment_transactions").update({ status: "failed", last_error: message.slice(0, 300) }).eq("id", tx.id);
    await audit({ actorType: p.actor.type, actorId: p.actor.id ?? null, action: "infinitepay_payment_failed", entity: "payment_transactions", entityId: tx.id, details: { flow: "checkout", error: message.slice(0, 300) }, ip: p.actor.ip ?? null });
    throw new HttpError(502, message);
  }
}

export const webhookUrl = (base: string, id: string, token: string) => `${base}/api/webhooks/infinitepay?o=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;

export type { CheckoutWebhook };
