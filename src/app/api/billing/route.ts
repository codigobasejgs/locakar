import { can } from "@/lib/permissions";
import { DEFAULT_PLANS, sellable, type PlanRow } from "@/lib/plans";
import { globalDb, scoped } from "@/lib/server/org-context";
import { billingProviders, createPlanInvoice, reconcileInfinitePayInvoice } from "@/lib/server/platform-billing";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";

/**
 * Assinatura da locadora no Frota Easy (Configurações → Assinatura).
 * GET  → plano atual, vencimento, planos à venda, meios disponíveis e últimas faturas
 * POST { action: "checkout", planId, provider } → link de pagamento (dono/administrador)
 * POST { action: "check", invoiceId, transactionNsu, slug } → retorno da InfinitePay (confirma no servidor)
 */
export const dynamic = "force-dynamic";

export const GET = scoped(async function GET() {
  try {
    const { orgId } = await requireStaff("read");
    const g = globalDb();
    const [sub, plans, invoices, providers] = await Promise.all([
      g.from("subscriptions").select("plan_id,trial_ends_at,current_period_end").eq("organization_id", orgId).maybeSingle(),
      g.from("plans").select("id,name,price_cents,promo_price_cents,promo_active,promo_label,promo_ends_at,highlight,sort,entitlements").eq("active", true),
      g.from("platform_invoices").select("id,plan_id,amount_cents,provider,status,checkout_url,paid_at,period_end,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
      billingProviders().catch(() => ({ infinitepay: false, asaas: false })),
    ]);
    const list = sellable((plans.data as PlanRow[] | null) ?? []);
    return Response.json({ subscription: sub.data ?? null, plans: list.length ? list : DEFAULT_PLANS, invoices: invoices.data ?? [], providers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "checkout") {
      // "read" (e não "settings"): locadora suspensa precisa conseguir pagar; o papel é conferido abaixo.
      const { orgId, userId, role } = await requireStaff("read");
      if (!can(role, "settings")) throw new HttpError(403, "Somente o proprietário ou um administrador pode pagar a assinatura.");
      const provider = body.provider === "asaas" ? "asaas" : body.provider === "infinitepay" ? "infinitepay" : null;
      const planId = String(body.planId ?? "");
      if (!provider || !/^[a-z0-9_-]{2,40}$/.test(planId)) throw new HttpError(400, "Plano ou forma de pagamento inválidos.");
      const providers = await billingProviders();
      if (!providers[provider]) throw new HttpError(409, "Esta forma de pagamento está indisponível no momento. Escolha a outra.");
      return Response.json(await createPlanInvoice({ orgId, planId, provider, userId }));
    }
    if (body.action === "check") {
      const { orgId } = await requireStaff("read");
      const id = String(body.invoiceId ?? "");
      const { data: inv } = await globalDb().from("platform_invoices").select("id,status").eq("id", id).eq("organization_id", orgId).maybeSingle();
      if (!inv) throw new HttpError(404, "Fatura não encontrada.");
      const decision = inv.status === "paid" ? "already" : await reconcileInfinitePayInvoice({ id, transactionNsu: String(body.transactionNsu ?? "").slice(0, 120), slug: String(body.slug ?? "").slice(0, 120) });
      return Response.json({ decision });
    }
    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
