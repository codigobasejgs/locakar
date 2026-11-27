/**
 * Período da tela de Pagamentos (pelo vencimento da parcela). A locadora trabalha por semana,
 * então o padrão é a semana atual (segunda a domingo) no fuso de São Paulo (`today` vem de todaySP()).
 */
import { addDays, parseISODate } from "./utils";

export type PaymentPeriod = "week" | "month" | "custom";

export const PERIOD_OPTIONS: { value: PaymentPeriod; label: string }[] = [
  { value: "week", label: "Semana atual" },
  { value: "month", label: "Mês atual" },
  { value: "custom", label: "Personalizado" },
];

/** Intervalo [from, to] (datas ISO, inclusivas). Personalizado sem datas = sem limite naquele lado. */
export function periodRange(period: PaymentPeriod, today: string, custom: { from?: string; to?: string } = {}) {
  if (period === "week") {
    const dow = parseISODate(today).getDay(); // 0 = domingo
    const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (period === "month") {
    const [y, m] = today.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  const from = custom.from || undefined;
  const to = custom.to || undefined;
  // Datas invertidas: troca em vez de esconder tudo.
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

export const inPeriod = (dueDate: string, r: { from?: string; to?: string }) => (!r.from || dueDate >= r.from) && (!r.to || dueDate <= r.to);
