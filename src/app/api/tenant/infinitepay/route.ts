import { isValidOrderId, normalizeHandle } from "@/lib/infinitepay";
import { createReceiptCheckout, reconcileCheckout } from "@/lib/server/infinitepay";
import { loadSettings, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { readBody, tenantOptions, tenantRoute } from "@/lib/server/tenant";

/**
 * InfinitePay no App do Locatário (Checkout: Pix ou cartão até 12x no ambiente da InfinitePay).
 * POST { action: "checkout", rentalId, installmentId } → { url }  (só parcelas do próprio cliente)
 * POST { action: "check", id }                         → { status }  (payment_check; baixa automática se pago)
 * A baixa principal é feita pelo webhook; "check" só acelera quando o cliente volta ao app.
 */
export const dynamic = "force-dynamic";
// Cria o link na InfinitePay (API externa): folga acima do padrão da Vercel.
export const maxDuration = 30;
export const OPTIONS = tenantOptions;

export const POST = tenantRoute(async (request, { clientId, ip }) => {
  const body = await readBody(request);
  const db = serviceDb();
  const settings = await loadSettings(db);
  const cfg = settings.infinitepay;
  const handle = normalizeHandle(cfg?.handle ?? "");
  if (body.action === "checkout") {
    if (!cfg?.enabled || cfg.mode === "tap" || !handle) throw new HttpError(409, "Pagamento com cartão pela InfinitePay indisponível no momento.");
    const r = await createReceiptCheckout(db, { handle, rentalId: body.rentalId, receiptId: body.installmentId, clientId, actor: { type: "client", id: clientId, ip } });
    return { id: r.id, url: r.url, amountCents: r.amountCents };
  }

  if (body.action === "check") {
    if (!isValidOrderId(body.id)) throw new HttpError(400, "Pagamento inválido.");
    const { data: tx } = await db.from("payment_transactions").select("id,client_id,status,transaction_nsu,invoice_slug,receipt_url").eq("id", body.id).eq("flow", "checkout").maybeSingle();
    if (!tx || tx.client_id !== clientId) throw new HttpError(404, "Pagamento não encontrado.");
    if (tx.status === "paid") return { status: "paid" };
    if (!tx.transaction_nsu || !tx.invoice_slug) return { status: "pending" };
    const decision = await reconcileCheckout(db, { orderNsu: tx.id, transactionNsu: tx.transaction_nsu, slug: tx.invoice_slug, receiptUrl: tx.receipt_url ?? undefined });
    return { status: decision === "paid" || decision === "already" ? "paid" : decision === "mismatch" ? "amount_mismatch" : "pending" };
  }

  throw new HttpError(400, "Ação inválida.");
});
