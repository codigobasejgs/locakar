import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { parseWebhook } from "@/lib/infinitepay";
import { reconcileCheckout } from "@/lib/server/infinitepay";
import { serviceDb } from "@/lib/server/push";
import { audit, clientIp } from "@/lib/server/tenant";

/**
 * Webhook do Checkout Integrado InfinitePay (pagamento aprovado).
 * Documentação: responder em < 1s com 200; 400 faz a InfinitePay reenviar.
 * A InfinitePay não assina o webhook, então:
 *  1. a URL de cada cobrança leva um token aleatório próprio (?o=<order_nsu>&t=<token>);
 *  2. o pagamento só é confirmado depois do payment_check (servidor → InfinitePay), nunca pelo corpo recebido;
 *  3. confirmPaid é idempotente (webhook repetido não duplica parcela, receita nem notificação).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const url = new URL(request.url);
  const payload = parseWebhook(await request.json().catch(() => null));
  if (!payload) return Response.json({ ok: false, error: "payload inválido" }, { status: 400 });

  const db = serviceDb();
  const { data: tx } = await db.from("payment_transactions").select("*").eq("id", payload.order_nsu).eq("flow", "checkout").maybeSingle();
  // Pedido que não é nosso: 200 para não gerar reenvios infinitos.
  if (!tx) {
    console.warn("[infinitepay] webhook com order_nsu desconhecido");
    return Response.json({ ok: true });
  }

  const tokenOk = url.searchParams.get("o") === tx.id && !!tx.webhook_token && same(url.searchParams.get("t") ?? "", tx.webhook_token);
  await audit({ actorType: "system", action: "infinitepay_webhook_received", entity: "payment_transactions", entityId: tx.id, details: { tokenOk, transactionNsu: payload.transaction_nsu, amount: payload.amount, captureMethod: payload.capture_method }, ip: clientIp(request) });

  if (tx.status === "paid") {
    await audit({ actorType: "system", action: "infinitepay_webhook_duplicate", entity: "payment_transactions", entityId: tx.id, details: { transactionNsu: payload.transaction_nsu } });
    return Response.json({ ok: true });
  }

  // Só grava os identificadores vindos de uma URL com token válido (evita que terceiros os sobrescrevam).
  if (tokenOk) {
    const { error } = await db
      .from("payment_transactions")
      .update({ transaction_nsu: payload.transaction_nsu, invoice_slug: payload.invoice_slug, receipt_url: payload.receipt_url ?? null, capture_method: payload.capture_method || null })
      .eq("id", tx.id)
      .neq("status", "paid");
    if (error?.code === "23505") {
      await audit({ actorType: "system", action: "infinitepay_webhook_duplicate", entity: "payment_transactions", entityId: tx.id, details: { transactionNsu: payload.transaction_nsu } });
      return Response.json({ ok: true });
    }
    if (error) return Response.json({ ok: false }, { status: 400 }); // reenvio
  }

  // Confirmação fora do tempo de resposta: payment_check é a fonte da verdade.
  after(async () => {
    try {
      const decision = await reconcileCheckout(db, { orderNsu: tx.id, transactionNsu: payload.transaction_nsu, slug: payload.invoice_slug, receiptUrl: payload.receipt_url });
      if (decision === "pending") {
        await db.from("payment_transactions").update({ last_error: "Webhook recebido, mas o payment_check ainda não confirma o pagamento." }).eq("id", tx.id).neq("status", "paid");
      }
      await audit({ actorType: "system", action: "infinitepay_webhook_processed", entity: "payment_transactions", entityId: tx.id, details: { decision } });
    } catch (e) {
      console.error("[infinitepay] webhook:", (e as Error).message);
      await db.from("payment_transactions").update({ last_error: "Falha ao consultar payment_check após o webhook." }).eq("id", tx.id).neq("status", "paid");
    }
  });

  return Response.json({ ok: true });
}
