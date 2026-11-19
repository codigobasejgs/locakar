/**
 * Planos comerciais da Frota Easy: preço de tabela + preço promocional (ancoragem) e recursos por plano.
 * Fonte de verdade é o banco (public.plans, editável no Super Admin); DEFAULT_PLANS espelha a migration
 * 20261027000000_plan_pricing.sql e serve de fallback (build sem banco) e de base para os testes.
 */

export const PLAN_FEATURES = ["whatsapp_buttons", "smart_contracts", "periodic_checkin", "ai_copilot", "tracking_selsyn", "advanced_reports"] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export const FEATURE_LABEL: Record<PlanFeature, string> = {
  whatsapp_buttons: "Copiloto e autoatendimento por botões no WhatsApp",
  smart_contracts: "Contratos inteligentes + assinatura digital Autentique",
  periodic_checkin: "Check-in / vistoria periódica (semanal ou mensal)",
  ai_copilot: "Copiloto IA: áudio, foto e PDF de nota de oficina",
  tracking_selsyn: "Rastreamento e telemetria (Selsyn)",
  advanced_reports: "Relatórios gerenciais avançados (Visão 360°)",
};

/** Plano mais barato que libera cada recurso (texto do card de upgrade). */
export const FEATURE_MIN_PLAN: Record<PlanFeature, string> = {
  whatsapp_buttons: "Profissional",
  smart_contracts: "Profissional",
  periodic_checkin: "Profissional",
  ai_copilot: "Completo",
  tracking_selsyn: "Completo",
  advanced_reports: "Completo",
};

export interface PlanRow {
  id: string;
  name: string;
  price_cents: number | null;
  promo_price_cents: number | null;
  promo_active: boolean;
  promo_label: string | null;
  highlight: boolean;
  sort: number;
  entitlements: { features?: Partial<Record<PlanFeature, boolean>>; [k: string]: unknown };
}

const features = (on: PlanFeature[]) => Object.fromEntries(PLAN_FEATURES.map((f) => [f, on.includes(f)])) as Record<PlanFeature, boolean>;

export const DEFAULT_PLANS: PlanRow[] = [
  { id: "essencial", name: "Essencial", price_cents: 7990, promo_price_cents: 7990, promo_active: false, promo_label: null, highlight: false, sort: 1, entitlements: { features: features([]) } },
  {
    id: "profissional", name: "Profissional", price_cents: 9990, promo_price_cents: 7990, promo_active: true, promo_label: "Por tempo limitado", highlight: false, sort: 2,
    entitlements: { features: features(["whatsapp_buttons", "smart_contracts", "periodic_checkin"]) },
  },
  {
    id: "completo", name: "Completo", price_cents: 10990, promo_price_cents: 7990, promo_active: true, promo_label: "Oferta de lançamento • Por tempo limitado", highlight: true, sort: 3,
    entitlements: { features: features([...PLAN_FEATURES]) },
  },
];

/** Preço exibido: promocional só quando ativo e menor que o de tabela (senão não há "De/Por"). */
export function planPrice(p: Pick<PlanRow, "price_cents" | "promo_price_cents" | "promo_active">) {
  const list = p.price_cents ?? 0;
  const promo = p.promo_active && p.promo_price_cents != null && p.promo_price_cents < list;
  return { cents: promo ? p.promo_price_cents! : list, fromCents: promo ? list : null, promo };
}

/** Recurso liberado? Chave ausente (plano antigo/personalizado) = liberado; só `false` explícito bloqueia. */
export const planHasFeature = (entitlements: PlanRow["entitlements"] | null | undefined, f: PlanFeature) => entitlements?.features?.[f] !== false;

export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Planos à venda (exclui o "trial" e planos internos), na ordem da vitrine. */
export const sellable = (rows: PlanRow[]) => rows.filter((p) => p.price_cents != null).sort((a, b) => a.sort - b.sort);
