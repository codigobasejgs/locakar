import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { parseWebhook } from "@/lib/infinitepay";
import { globalDb } from "@/lib/server/org-context";
import { reconcileInfinitePayInvoice } from "@/lib/server/platform-billing";

/**
 * Webhook InfinitePay da assinatura Frota Easy (fatura da plataforma). Mesmo modelo do webhook das locações:
 * token aleatório por fatura na URL e baixa só depois do payment_check. Responde rápido; confirma no after().
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const url = new URL(request.url);
  const payload = parseWebhook(await request.json().catch(() => null));
  if (!payload) return Response.json({ ok: false, error: "payload inválido" }, { status: 400 });
  const id = url.searchParams.get("o") ?? "";
  if (id !== payload.order_nsu || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: true });
  const { data: inv } = await globalDb().from("platform_invoices").select("id,webhook_token").eq("id", id).maybeSingle();
  if (!inv?.webhook_token || !same(url.searchParams.get("t") ?? "", inv.webhook_token)) return Response.json({ ok: true });
  after(async () => {
    try {
      await reconcileInfinitePayInvoice({ id, transactionNsu: payload.transaction_nsu, slug: payload.invoice_slug });
    } catch (e) {
      console.error("[assinatura] webhook InfinitePay:", (e as Error).message);
    }
  });
  return Response.json({ ok: true });
}
