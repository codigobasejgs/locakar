import { GATEWAYS, isGateway } from "@/lib/gateways";
import { createGatewayLink, reconcileGateway } from "@/lib/server/gateways";
import { serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { readBody, tenantOptions, tenantRoute } from "@/lib/server/tenant";

/**
 * Mercado Pago, PagBank e Pagar.me no App do Locatário.
 * POST { action: "checkout", provider, rentalId, installmentId } → { id, url }  (só parcelas do próprio cliente)
 * POST { action: "check", id }                                    → { status }    (consulta o gateway; baixa se pago)
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const OPTIONS = tenantOptions;

export const POST = tenantRoute(async (request, { clientId, ip }) => {
  const body = await readBody(request);
  const db = serviceDb();
  if (body.action === "checkout") {
    if (!isGateway(body.provider)) throw new HttpError(400, "Forma de pagamento inválida.");
    const r = await createGatewayLink(db, body.provider, { rentalId: body.rentalId, receiptId: body.installmentId, clientId, actor: { type: "client", id: clientId, ip } });
    return { id: r.id, url: r.url, amountCents: r.amountCents };
  }
  if (body.action === "check") {
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new HttpError(400, "Pagamento inválido.");
    const { data: tx } = await db.from("payment_transactions").select("id,provider,client_id,status").eq("id", body.id).in("provider", Object.keys(GATEWAYS)).maybeSingle();
    if (!tx || tx.client_id !== clientId || !isGateway(tx.provider)) throw new HttpError(404, "Pagamento não encontrado.");
    if (tx.status === "paid") return { status: "paid" };
    const decision = await reconcileGateway(db, tx.provider, tx.id);
    return { status: decision === "paid" || decision === "already" ? "paid" : decision === "mismatch" ? "amount_mismatch" : "pending" };
  }
  throw new HttpError(400, "Ação inválida.");
});
