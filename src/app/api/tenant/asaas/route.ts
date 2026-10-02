import { bankSlipLine, createCharge, loadAsaasConfig, loadTx, pixQrCode, readyForCharges, reconcileTx } from "@/lib/server/asaas";
import { serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { readBody, tenantOptions, tenantRoute } from "@/lib/server/tenant";

/**
 * Asaas no App do Locatário (o app nunca fala com o Asaas nem vê a API Key).
 * POST { action: "pay", rentalId, installmentId, billingType } → cobrança (reaproveita a aberta da parcela)
 * POST { action: "pix" | "boleto" | "status", id }             → QR/linha digitável/status (só do próprio cliente)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = tenantOptions;

const view = (t: Awaited<ReturnType<typeof loadTx>>) => ({ id: t.id, status: t.status, providerStatus: t.provider_status, billingType: t.billing_type, invoiceUrl: t.invoice_url, bankSlipUrl: t.bank_slip_url, dueDate: t.due_date, amountCents: t.amount_cents });

export const POST = tenantRoute(async (request, { clientId, ip }) => {
  const body = await readBody(request);
  const db = serviceDb();
  const cfg = await loadAsaasConfig(db);
  if (!cfg) throw new HttpError(409, "Pagamento online indisponível no momento. Use o PIX.");

  if (body.action === "pay") {
    if (!readyForCharges(cfg)) throw new HttpError(409, "Pagamento online indisponível no momento. Use o PIX.");
    const r = await createCharge(db, cfg, { rentalId: body.rentalId, receiptId: body.installmentId, billingType: body.billingType, clientId, actor: { type: "client", id: clientId, ip } });
    return { charge: view(r.tx) };
  }

  const tx = await loadTx(db, body.id);
  if (tx.client_id !== clientId) throw new HttpError(404, "Cobrança não encontrada.");
  if (body.action === "pix") return pixQrCode(cfg, tx);
  if (body.action === "boleto") return bankSlipLine(cfg, tx);
  if (body.action === "status") return { charge: view(await reconcileTx(db, cfg, tx, { type: "client", id: clientId })) };
  throw new HttpError(400, "Ação inválida.");
});
