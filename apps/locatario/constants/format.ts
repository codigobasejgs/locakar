/** Formatação pt-BR. Datas do servidor vêm como "AAAA-MM-DD": lidas sem fuso para não virar o dia anterior. */
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const money = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));

export const date = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const RENTAL_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  active: { label: "Em andamento", tone: "success" },
  late: { label: "Atrasada", tone: "danger" },
  pending: { label: "Aguardando início", tone: "warning" },
  finished: { label: "Finalizada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

export const INTEREST_LABEL: Record<string, string> = { daily: "ao dia", weekly: "por semana", monthly: "ao mês" };
