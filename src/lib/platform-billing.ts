/**
 * Assinatura das locadoras (Frota Easy → locadora). Puro: referências e regras usadas no servidor e nos testes.
 * Fatura = um mês do plano no preço vigente (promoção dentro do prazo, senão tabela), sempre calculado no servidor.
 */
import { planPrice, type PlanRow } from "./plans";

export const INVOICE_REF = "frotaeasy-inv:";
export const invoiceReference = (id: string) => `${INVOICE_REF}${id}`;
export function parseInvoiceReference(ref: unknown): string | null {
  const m = typeof ref === "string" ? /^frotaeasy-inv:([0-9a-f-]{36})$/i.exec(ref) : null;
  return m ? m[1] : null;
}

/** Valor do mês do plano (centavos). Planos sem preço (teste grátis) não são cobráveis. */
export function invoiceAmount(plan: Pick<PlanRow, "price_cents" | "promo_price_cents" | "promo_active" | "promo_ends_at">, now = Date.now()) {
  if (plan.price_cents == null) return null;
  const { cents } = planPrice(plan, now);
  return cents >= 100 ? cents : null;
}

/** Faixa de aviso no painel: dias até vencer (negativo = vencida). null = sem período pago. */
export function daysToRenew(periodEnd: string | null, now = Date.now()) {
  return periodEnd ? Math.ceil((Date.parse(periodEnd) - now) / 86_400_000) : null;
}
