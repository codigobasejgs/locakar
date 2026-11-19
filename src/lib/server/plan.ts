import "server-only";
import { DEFAULT_PLANS, FEATURE_LABEL, FEATURE_MIN_PLAN, planHasFeature, sellable, type PlanFeature, type PlanRow } from "@/lib/plans";
import { globalDb, requireOrg } from "./org-context";
import { HttpError } from "./supabase";

/** Recursos do plano da locadora (subscriptions → plans). Sem assinatura = nada bloqueado (legado). */
export async function orgEntitlements(orgId: string): Promise<PlanRow["entitlements"] | null> {
  const { data } = await globalDb().rpc("org_entitlements", { p_org: orgId });
  return (data as PlanRow["entitlements"] | null) ?? null;
}

/** O plano da locadora libera `feature`? Fonte única para backend (rotas, webhook, bot). */
export async function hasPlanFeature(orgId: string, feature: PlanFeature) {
  return planHasFeature(await orgEntitlements(orgId), feature);
}

/** Planos à venda (landing). Sem banco/colunas (build local, migration pendente): os valores oficiais do código. */
export async function publicPlans(): Promise<PlanRow[]> {
  if (!process.env.SUPABASE_SECRET_KEY) return DEFAULT_PLANS;
  const { data, error } = await globalDb()
    .from("plans")
    .select("id,name,price_cents,promo_price_cents,promo_active,promo_label,highlight,sort,entitlements")
    .eq("active", true);
  const rows = sellable((data as PlanRow[] | null) ?? []);
  return error || !rows.length ? DEFAULT_PLANS : rows;
}

/** Mensagem do bloqueio, igual à do card de upgrade no painel. */
export const upgradeMessage = (f: PlanFeature) => `${FEATURE_LABEL[f]}: recurso disponível a partir do plano ${FEATURE_MIN_PLAN[f]}. Fale com a Frota Easy para fazer o upgrade.`;

/** Bloqueia a operação na locadora atual quando o plano não inclui o recurso (HTTP 402 com texto de upgrade). */
export async function requirePlanFeature(feature: PlanFeature) {
  if (!(await hasPlanFeature(requireOrg().org.id, feature))) throw new HttpError(402, upgradeMessage(feature));
}
