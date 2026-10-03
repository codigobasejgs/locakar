import { PAYMENT_METHOD_IDS, type PaymentMethodId } from "@/lib/payment-methods";
import { getPaymentMethods, openCount, setMethodEnabled } from "@/lib/server/payment-methods";
import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { clientIp } from "@/lib/server/tenant";
import { scoped } from "@/lib/server/org-context";

/**
 * Configurações → Meios de pagamento (somente equipe).
 * GET  → estado dos três meios (+ cobranças abertas de cada um)
 * POST { method, enabled } → liga/desliga (servidor valida configuração e audita)
 */
export const dynamic = "force-dynamic";
const noStore = { headers: { "Cache-Control": "private, no-store" } };

async function staff() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.auth.getClaims();
  return data!.claims.sub as string;
}
const withOpen = async (db: ReturnType<typeof serviceDb>, methods: Awaited<ReturnType<typeof getPaymentMethods>>["methods"]) =>
  Promise.all(methods.map(async (m) => ({ ...m, open: await openCount(db, m.id) })));

export const GET = scoped(async function GET() {
  try {
    await staff();
    const db = serviceDb();
    return Response.json({ methods: await withOpen(db, (await getPaymentMethods(db)).methods) }, noStore);
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const operator = await staff();
    const body = (await request.json().catch(() => ({}))) as { method?: unknown; enabled?: unknown };
    if (!PAYMENT_METHOD_IDS.includes(body.method as PaymentMethodId) || typeof body.enabled !== "boolean") throw new HttpError(400, "Dados inválidos.");
    const db = serviceDb();
    const methods = await setMethodEnabled(db, body.method as PaymentMethodId, body.enabled, { id: operator, ip: clientIp(request) });
    return Response.json({ methods: await withOpen(db, methods) }, noStore);
  } catch (e) {
    return errorResponse(e);
  }
});
