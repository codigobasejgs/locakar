import { infinitePayState } from "@/lib/payment-methods";
import { COMPANY } from "@/lib/company";
import {
  buildTapDeeplink,
  isValidOrderId,
  normalizeHandle,
  parseTapResult,
  validateTap,
  type TapMethod,
} from "@/lib/infinitepay";
import { confirmPaid, createReceiptCheckout, openReceipt, reconcileCheckout } from "@/lib/server/infinitepay";
import { loadSettings, serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";
import { brand, scoped } from "@/lib/server/org-context";

/**
 * InfinitePay no painel (somente equipe). O valor sempre sai do servidor (parcela + multa/juros);
 * a parcela só vira paga por payment_check/webhook (Checkout) ou confirmação da equipe (Tap).
 * GET  ?rentalId&receiptId → tentativas da parcela | ?view=status → estado da integração
 * POST { action: "tap.start" | "tap.result" | "tap.confirm" | "checkout.create" | "checkout.check" | "checkout.whatsapp" | "cancel", ... }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || COMPANY.siteUrl).replace(/\/+$/, "");
const PUBLIC_COLS =
  "id,flow,rental_id,receipt_id,client_id,amount_cents,method,installments,status,handle,checkout_url,invoice_slug,transaction_nsu,capture_method,paid_amount_cents,receipt_url,nsu,authorization_code,card_brand,merchant_document,warning,last_error,created_at,updated_at,paid_at";

async function staff() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.auth.getClaims();
  return data!.claims.sub as string;
}

async function config() {
  const db = serviceDb();
  const settings = await loadSettings(db);
  const ip = settings.infinitepay!;
  return { db, settings, ip, handle: normalizeHandle(ip.handle) };
}

async function loadTx(db: ReturnType<typeof serviceDb>, id: unknown) {
  if (!isValidOrderId(id)) throw new HttpError(400, "Transação inválida.");
  const { data } = await db.from("payment_transactions").select("*").eq("id", id).eq("provider", "infinitepay").maybeSingle();
  if (!data) throw new HttpError(404, "Transação não encontrada.");
  return data;
}

export const GET = scoped(async function GET(request: Request) {
  try {
    await staff();
    const { db, ip, handle } = await config();
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "status") {
      const [last, lastWebhook, lastError] = await Promise.all([
        db.from("payment_transactions").select("id,flow,status,amount_cents,created_at").eq("provider", "infinitepay").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("audit_log").select("created_at,details").eq("action", "infinitepay_webhook_received").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("payment_transactions").select("last_error,updated_at").eq("provider", "infinitepay").not("last_error", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const state = !ip.enabled ? "disabled" : handle ? "configured" : "incomplete";
      return Response.json({
        state,
        handle,
        mode: ip.mode,
        webhookUrl: `${siteUrl()}/api/webhooks/infinitepay`,
        redirectUrl: `${siteUrl()}/pagamento/infinitepay`,
        tapResultUrl: `${siteUrl()}/admin/pagamentos/infinitepay`,
        lastTransaction: last.data ?? null,
        lastWebhookAt: lastWebhook.data?.created_at ?? null,
        lastError: lastError.data ?? null,
      });
    }
    const rentalId = url.searchParams.get("rentalId");
    const receiptId = url.searchParams.get("receiptId");
    if (!rentalId || !receiptId) throw new HttpError(400, "Parcela não informada.");
    const { data } = await db.from("payment_transactions").select(PUBLIC_COLS).eq("provider", "infinitepay").eq("rental_id", rentalId).eq("receipt_id", receiptId).order("created_at", { ascending: false }).limit(20);
    return Response.json({ transactions: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const operator = await staff();
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const cfg = await config();
    const { db } = cfg;
    // Desativada: bloqueia só operações novas (tap.start/checkout.create); confirmar/consultar/cancelar existentes continua.
    const newOperation = body.action === "tap.start" || body.action === "checkout.create" || body.action === "checkout.whatsapp";
    if (newOperation && !infinitePayState(cfg.ip).enabled) throw new HttpError(409, "InfinitePay está desativada em Configurações → Meios de pagamento.");
    const actor = { type: "staff" as const, id: operator, ip };

    // ---------- InfiniteTap: gera o deeplink (sem API key) ----------
    if (body.action === "tap.start") {
      if (cfg.ip.mode === "checkout") throw new HttpError(409, "Pagamento por aproximação desativado em Configurações.");
      const { rental, receipt, cents, client } = await openReceipt(db, body.rentalId, body.receiptId);
      const method: TapMethod = body.method === "debit" ? "debit" : "credit";
      const installments = method === "debit" ? 1 : Number(body.installments) || 1;
      const err = validateTap(cents, method, installments);
      if (err) throw new HttpError(422, err);
      const device = typeof body.device === "string" ? body.device.slice(0, 200) : request.headers.get("user-agent")?.slice(0, 200) ?? null;
      const { data: tx, error } = await db
        .from("payment_transactions")
        .insert({ flow: "tap", rental_id: rental.id, receipt_id: receipt.id, client_id: rental.clientId, amount_cents: cents, method, installments, handle: cfg.handle || null, operator_id: operator, device })
        .select("id")
        .single();
      if (error) throw new HttpError(500, "Não foi possível iniciar a transação.");
      const deeplink = buildTapDeeplink({
        cents,
        method,
        installments,
        orderId: tx.id,
        resultUrl: `${siteUrl()}/admin/pagamentos/infinitepay`,
        referrer: brand().name.slice(0, 40),
        ...(cfg.ip.tapCheckAccount ? { handle: cfg.handle || undefined, docNumber: cfg.ip.docNumber || undefined } : {}),
        ios: body.ios === true,
      });
      await audit({ actorType: "staff", actorId: operator, action: "infinitepay_payment_started", entity: "payment_transactions", entityId: tx.id, details: { flow: "tap", rentalId: rental.id, receiptId: receipt.id, amountCents: cents, method, installments, client: client?.name }, ip });
      return Response.json({ id: tx.id, deeplink, amountCents: cents });
    }

    // ---------- InfiniteTap: retorno do result_url (NUNCA marca como pago sozinho) ----------
    if (body.action === "tap.result") {
      const r = parseTapResult((body.params ?? {}) as Record<string, unknown>);
      const tx = await loadTx(db, r.order_id);
      if (tx.flow !== "tap") throw new HttpError(400, "Transação inválida.");
      if (tx.status === "paid") return Response.json({ id: tx.id, status: "paid" });
      const handleMismatch = cfg.handle && r.handle && r.handle.toLowerCase() !== cfg.handle ? `Conta InfinitePay diferente: ${r.handle}` : null;
      const warning = r.warning ?? handleMismatch;
      const status = warning || !r.nsu ? "failed" : "awaiting_confirmation";
      const { error } = await db
        .from("payment_transactions")
        .update({
          status,
          nsu: r.nsu ?? null,
          authorization_code: r.aut ?? null,
          card_brand: r.card_brand ?? null,
          ip_user_id: r.user_id ?? null,
          ip_access_id: r.access_id ?? null,
          merchant_document: r.merchant_document ?? null,
          handle: r.handle ?? tx.handle,
          warning: warning ?? (r.nsu ? null : "Retorno sem NSU"),
        })
        .eq("id", tx.id)
        .neq("status", "paid");
      if (error?.code === "23505") throw new HttpError(409, "Este NSU já foi registrado em outra transação.");
      if (error) throw new HttpError(500, "Não foi possível registrar o retorno.");
      await audit({ actorType: "staff", actorId: operator, action: status === "failed" ? "infinitepay_payment_failed" : "infinitepay_payment_returned", entity: "payment_transactions", entityId: tx.id, details: { flow: "tap", nsu: r.nsu ?? null, aut: r.aut ?? null, brand: r.card_brand ?? null, warning: warning ?? null }, ip });
      return Response.json({ id: tx.id, status, warning: warning ?? null, amountCents: tx.amount_cents, nsu: r.nsu ?? null, aut: r.aut ?? null, cardBrand: r.card_brand ?? null });
    }

    // ---------- InfiniteTap: equipe confere no app InfinitePay e confirma ----------
    if (body.action === "tap.confirm") {
      const tx = await loadTx(db, body.id);
      if (tx.flow !== "tap") throw new HttpError(400, "Transação inválida.");
      if (tx.status !== "awaiting_confirmation") throw new HttpError(409, tx.status === "paid" ? "Esta transação já foi confirmada." : "Só é possível confirmar uma transação aprovada no app InfinitePay (com NSU).");
      const done = await confirmPaid(db, tx, { paidCents: tx.amount_cents, method: tx.method, installments: tx.installments, transactionNsu: tx.nsu ?? undefined }, actor);
      if (!done) throw new HttpError(409, "Esta parcela já foi quitada por outra transação.");
      return Response.json({ ok: true, status: "paid" });
    }

    // ---------- Checkout Integrado: cria o link ----------
    if (body.action === "checkout.create") {
      if (cfg.ip.mode === "tap") throw new HttpError(409, "Checkout desativado em Configurações.");
      if (!cfg.handle) throw new HttpError(409, "Configure a InfiniteTag em Configurações → InfinitePay.");
      const r = await createReceiptCheckout(db, { handle: cfg.handle, rentalId: body.rentalId, receiptId: body.receiptId, operatorId: operator, actor: { type: "staff", id: operator, ip } });
      return Response.json(r);
    }

    // ---------- Checkout: consulta payment_check (fonte da verdade) ----------
    if (body.action === "checkout.check") {
      const tx = await loadTx(db, body.id);
      if (tx.flow !== "checkout") throw new HttpError(400, "Transação inválida.");
      if (tx.status === "paid") return Response.json({ status: "paid" });
      if (!tx.transaction_nsu || !tx.invoice_slug) {
        return Response.json({ status: tx.status, message: "Ainda sem pagamento registrado pela InfinitePay (o link não foi pago ou o retorno não chegou)." });
      }
      const decision = await reconcileCheckout(db, { orderNsu: tx.id, transactionNsu: tx.transaction_nsu, slug: tx.invoice_slug, receiptUrl: tx.receipt_url ?? undefined });
      if (decision === "paid" || decision === "already") return Response.json({ status: "paid" });
      if (decision === "mismatch") return Response.json({ status: "amount_mismatch" });
      return Response.json({ status: tx.status, message: "Pagamento ainda não confirmado pela InfinitePay." });
    }

    // ---------- Checkout: envia o link pelo WhatsApp oficial (Evolution) ----------
    if (body.action === "checkout.whatsapp") {
      const tx = await loadTx(db, body.id);
      if (tx.flow !== "checkout" || !tx.checkout_url || tx.status !== "link_created") throw new HttpError(409, "Este link não está mais disponível.");
      const { receipt, client, vehicle } = await openReceipt(db, tx.rental_id, tx.receipt_id);
      if (!client?.phone) throw new HttpError(422, "Cliente sem WhatsApp cadastrado.");
      const text = [
        `Olá, ${client.name.split(" ")[0]}.`,
        "",
        "Segue o link para pagamento referente à sua locação.",
        "",
        `Veículo: ${vehicle?.plate ?? "—"}`,
        `Valor: ${formatCurrency(tx.amount_cents / 100)}`,
        `Vencimento: ${formatDate(receipt.dueDate)}`,
        "",
        "Link:",
        tx.checkout_url,
        "",
        `${brand().name} — Locadora de Veículos`,
      ].join("\n");
      const sent = await sendWhatsApp(db, { kind: "charge", phone: client.phone, text, rentalId: tx.rental_id });
      if (!sent.ok) throw new HttpError(502, sent.error ?? "Não foi possível enviar pelo WhatsApp.");
      return Response.json({ ok: true });
    }

    if (body.action === "cancel") {
      const tx = await loadTx(db, body.id);
      const { data } = await db.from("payment_transactions").update({ status: "cancelled" }).eq("id", tx.id).in("status", ["started", "link_created", "awaiting_confirmation", "failed"]).select("id").maybeSingle();
      if (!data) throw new HttpError(409, "Esta transação não pode ser cancelada.");
      await audit({ actorType: "staff", actorId: operator, action: "infinitepay_payment_cancelled", entity: "payment_transactions", entityId: tx.id, details: { flow: tx.flow }, ip });
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});

