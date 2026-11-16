import { GATEWAYS, isGateway, type GatewayEnv } from "@/lib/gateways";
import { cancelGatewayTx, createGatewayLink, gatewayPanel, hasGatewayKey, reconcileGateway, saveGateway } from "@/lib/server/gateways";
import { openReceipt } from "@/lib/server/infinitepay";
import { brand, scoped } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { clientIp } from "@/lib/server/tenant";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Mercado Pago, PagBank e Pagar.me no painel.
 * GET  ?view=config → estado dos gateways (sem segredos) | ?rentalId&receiptId → cobranças da parcela
 * POST { action: "save", provider, environment, credential?, webhookSecret?, regenerateToken? } (dono/admin)
 *      { action: "create" | "whatsapp" | "check" | "cancel", provider?, rentalId?, receiptId?, id? } (financeiro)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const COLS = "id,provider,status,amount_cents,method,installments,checkout_url,last_error,created_at,paid_at";

export const GET = scoped(async function GET(request: Request) {
  try {
    await requireStaff("finance");
    const db = serviceDb();
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "config") return Response.json({ masterKeyReady: hasGatewayKey(), gateways: await gatewayPanel(db) });
    const rentalId = url.searchParams.get("rentalId");
    const receiptId = url.searchParams.get("receiptId");
    if (!rentalId || !receiptId) throw new HttpError(400, "Parcela não informada.");
    const { data } = await db.from("payment_transactions").select(COLS).in("provider", Object.keys(GATEWAYS)).eq("rental_id", rentalId).eq("receipt_id", receiptId).order("created_at", { ascending: false }).limit(20);
    return Response.json({ transactions: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { userId } = await requireStaff(body.action === "save" ? "integrations" : "finance");
    const db = serviceDb();
    const ip = clientIp(request);
    const actor = { type: "staff" as const, id: userId, ip };

    if (body.action === "save") {
      if (!isGateway(body.provider)) throw new HttpError(400, "Gateway inválido.");
      const environment: GatewayEnv = body.environment === "production" ? "production" : "sandbox";
      await saveGateway(db, body.provider, { environment, credential: typeof body.credential === "string" ? body.credential : undefined, webhookSecret: typeof body.webhookSecret === "string" ? body.webhookSecret : undefined, regenerateToken: body.regenerateToken === true }, { id: userId, ip });
      return Response.json({ ok: true, gateways: await gatewayPanel(db) });
    }

    if (body.action === "create") {
      if (!isGateway(body.provider)) throw new HttpError(400, "Gateway inválido.");
      return Response.json(await createGatewayLink(db, body.provider, { rentalId: body.rentalId, receiptId: body.receiptId, operatorId: userId, actor }));
    }

    // Ações sobre uma cobrança existente: o gateway vem do registro (nunca do corpo).
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new HttpError(400, "Cobrança inválida.");
    const { data: tx } = await db.from("payment_transactions").select("id,provider,status,checkout_url,rental_id,receipt_id,amount_cents").eq("id", body.id).in("provider", Object.keys(GATEWAYS)).maybeSingle();
    if (!tx || !isGateway(tx.provider)) throw new HttpError(404, "Cobrança não encontrada.");

    if (body.action === "check") {
      const decision = await reconcileGateway(db, tx.provider, tx.id, null, { type: "staff", id: userId });
      return Response.json({ status: decision === "paid" || decision === "already" ? "paid" : decision === "mismatch" ? "amount_mismatch" : "pending" });
    }
    if (body.action === "cancel") {
      await cancelGatewayTx(db, tx.id, { id: userId, ip });
      return Response.json({ ok: true });
    }
    if (body.action === "whatsapp") {
      if (tx.status !== "link_created" || !tx.checkout_url) throw new HttpError(409, "Este link não está mais disponível.");
      const { receipt, client, vehicle } = await openReceipt(db, tx.rental_id, tx.receipt_id);
      if (!client?.phone) throw new HttpError(422, "Cliente sem WhatsApp cadastrado.");
      const text = [
        `Olá, ${client.name.split(" ")[0]}.`,
        "",
        `Segue o link para pagamento da sua locação (${GATEWAYS[tx.provider].label.replace(/ \(.*\)$/, "")}: Pix, cartão ou boleto).`,
        "",
        `Veículo: ${vehicle?.plate ?? "—"}`,
        `Valor: ${formatCurrency(tx.amount_cents / 100)}`,
        `Vencimento: ${formatDate(receipt.dueDate)}`,
        "",
        tx.checkout_url,
        "",
        `${brand().name} — Locadora de Veículos`,
      ].join("\n");
      const sent = await sendWhatsApp(db, { kind: "charge", phone: client.phone, text, rentalId: tx.rental_id });
      if (!sent.ok) throw new HttpError(502, sent.error ?? "Não foi possível enviar pelo WhatsApp.");
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
