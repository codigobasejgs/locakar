import type { Client } from "@/types";

export function clientKmPeriod(c: Pick<Client, "kmPeriod" | "kmDaily" | "kmMonthly">) {
  return c.kmPeriod ?? (c.kmDaily != null ? "daily" : c.kmMonthly != null ? "monthly" : "daily");
}
export function clientKmLabel(c: Client) {
  const period = clientKmPeriod(c);
  const value = period === "weekly" ? c.kmWeekly : period === "monthly" ? c.kmMonthly : c.kmDaily;
  return value == null ? "—" : `${value.toLocaleString("pt-BR")} km/${period === "weekly" ? "semana" : period === "monthly" ? "mês" : "dia"}`;
}
export function clientRegistrationDate(c?: Pick<Client, "createdAt" | "registeredAt"> | null) {
  if (!c) return "ao salvar";
  if (c.createdAt && Number.isFinite(Date.parse(c.createdAt))) return new Date(c.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.registeredAt ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Não informado";
}
