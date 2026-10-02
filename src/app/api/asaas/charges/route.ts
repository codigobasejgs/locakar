import { BILLING_LABEL } from "@/lib/asaas";
import { bankSlipLine, cancelCharge, releaseChargeIfSettled, createCharge, loadAsaasConfig, loadTx, pixQrCode, publicConfig, readyForCharges, reconcileTx, syncChargeWithReceipt, TX_COLS, asaasFetch, apiKeyFor, type AsaasTx } from "@/lib/server/asaas";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { openReceipt } from "@/lib/server/infinitepay";
import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Cobranças Asaas no painel (somente equipe). Valor/vencimento sempre do servidor.
 * GET  → { config, charges } (cobranças Asaas para os badges da tela Pagamentos) | ?rentalId&receiptId → histórico da parcela
 * POST { action: "create" | "receipt.settled" | "reconcile" | "pix" | "boleto" | "cancel" | "sync" | "whatsapp" | "email" | "sandbox.confirm", ... }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function staff() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.auth.getClaims();
  return data!.claims.sub as string;
}

export async function GET(request: Request) {
  try {
    await staff();
    const db = serviceDb();
    const url = new URL(request.url);
    const rentalId = url.searchParams.get("rentalId");
    const receiptId = url.searchParams.get("receiptId");
    if (rentalId && receiptId) {
      const { data } = await db.from("payment_transactions").select(TX_COLS).eq("provider", "asaas").eq("rental_id", rentalId).eq("receipt_id", receiptId).order("created_at", { ascending: false }).limit(20);
      return Response.json({ charges: data ?? [] });
    }
    const cfg = await loadAsaasConfig(db);
    // Última cobrança Asaas de cada parcela (inclusive com a integração desligada: histórico continua visível).
    const { data } = cfg ? await db.from("payment_transactions").select(TX_COLS).eq("provider", "asaas").order("created_at", { ascending: false }).limit(2000) : { data: [] };
    const latest: Record<string, AsaasTx> = {};
    for (const t of (data ?? []) as AsaasTx[]) latest[`${t.rental_id}:${t.receipt_id}`] ??= t;
    const c = publicConfig(cfg);
    return Response.json({ config: { enabled: c.enabled, ready: readyForCharges(cfg), environment: c.environment, methods: c.methods, allowUndefined: c.allowUndefined, notifyWhatsapp: c.notifyWhatsapp, notifyEmail: c.notifyEmail }, charges: latest });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await staff();
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = serviceDb();
    const cfg = await loadAsaasConfig(db);
    if (!cfg) throw new HttpError(409, "Integração Asaas não instalada (migration pendente).");

    if (body.action === "create") {
      const r = await createCharge(db, cfg, { rentalId: body.rentalId, receiptId: body.receiptId, billingType: body.billingType, actor: { type: "staff", id: operator, ip } });
      return Response.json({ charge: r.tx, reused: r.reused });
    }

    // Parcela baixada/cancelada/excluída no painel: cancela a cobrança Asaas aberta (estado conferido no banco).
    if (body.action === "receipt.settled") {
      if (typeof body.rentalId !== "string" || typeof body.receiptId !== "string") throw new HttpError(400, "Parcela não informada.");
      return Response.json({ result: await releaseChargeIfSettled(db, body.rentalId, body.receiptId, { type: "staff", id: operator }, typeof body.reason === "string" ? body.reason.slice(0, 40) : "baixa manual") });
    }

    const tx = await loadTx(db, body.id);

    if (body.action === "reconcile") {
      const fresh = await reconcileTx(db, cfg, tx, { type: "staff", id: operator });
      await audit({ actorType: "staff", actorId: operator, action: "asaas_status_reconciled", entity: "payment_transactions", entityId: tx.id, details: { status: fresh?.status, providerStatus: fresh?.provider_status }, ip });
      return Response.json({ charge: fresh });
    }
    if (body.action === "pix") return Response.json(await pixQrCode(cfg, tx));
    if (body.action === "boleto") return Response.json(await bankSlipLine(cfg, tx));
    if (body.action === "cancel") {
      await cancelCharge(db, cfg, tx, { id: operator, ip });
      return Response.json({ charge: await loadTx(db, tx.id) });
    }
    if (body.action === "sync") return Response.json({ charge: await syncChargeWithReceipt(db, cfg, tx, { id: operator, ip }) });

    if (body.action === "whatsapp" || body.action === "email") {
      if (tx.status !== "link_created" || !tx.invoice_url) throw new HttpError(409, "Esta cobrança não está mais em aberto.");
      const { client, vehicle } = await openReceipt(db, tx.rental_id, tx.receipt_id);
      const first = client?.name?.split(" ")[0] ?? "cliente";
      const rows: [string, string][] = [["Veículo", vehicle?.plate ?? "—"], ["Valor", formatCurrency(tx.amount_cents / 100)], ["Vencimento", tx.due_date ? formatDate(tx.due_date) : "—"], ["Forma", BILLING_LABEL[tx.billing_type ?? ""] ?? "Fatura"]];
      if (body.action === "whatsapp") {
        if (!client?.phone) throw new HttpError(422, "Cliente sem WhatsApp cadastrado.");
        const text = [`Olá, ${first}!`, "", "Sua cobrança LOCAKAR está disponível.", "", ...rows.map(([k, v]) => `${k}: ${v}`), "", "Pague pelo link:", tx.invoice_url, "", "LOCAKAR — Locadora de Veículos"].join("\n");
        const sent = await sendWhatsApp(db, { kind: "charge", phone: client.phone, text, rentalId: tx.rental_id });
        if (!sent.ok) throw new HttpError(502, sent.error ?? "Não foi possível enviar pelo WhatsApp.");
      } else {
        if (!client?.email) throw new HttpError(422, "Cliente sem e-mail cadastrado.");
        await sendEmail(db, { kind: "charge", to: client.email, rentalId: tx.rental_id, subject: `Cobrança LOCAKAR — ${formatCurrency(tx.amount_cents / 100)}`, html: emailLayout({ title: "Sua cobrança está disponível", intro: `Olá, ${first}! Segue a cobrança da sua locação.`, rows, cta: { label: "Pagar agora", url: tx.invoice_url } }) });
      }
      await audit({ actorType: "staff", actorId: operator, action: `asaas_charge_sent_${body.action}`, entity: "payment_transactions", entityId: tx.id, details: {}, ip });
      return Response.json({ ok: true });
    }

    // Homologação: o Asaas oferece este endpoint só no Sandbox para simular o pagamento.
    if (body.action === "sandbox.confirm") {
      if ((tx.environment ?? cfg.environment) !== "sandbox") throw new HttpError(403, "Disponível somente no Sandbox.");
      if (!tx.provider_payment_id || tx.status !== "link_created") throw new HttpError(409, "Cobrança não está em aberto.");
      await asaasFetch("sandbox", apiKeyFor(cfg, "sandbox"), "POST", `/sandbox/payment/${encodeURIComponent(tx.provider_payment_id)}/confirm`);
      await audit({ actorType: "staff", actorId: operator, action: "asaas_sandbox_payment_simulated", entity: "payment_transactions", entityId: tx.id, details: {}, ip });
      return Response.json({ charge: await reconcileTx(db, cfg, tx, { type: "staff", id: operator }) });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}
