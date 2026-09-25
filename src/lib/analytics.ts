/** Cálculos de indicadores a partir das coleções (puro, sem React). */
import type { Collections } from "@/repositories/types";
import type { CompanySettings, Rental } from "@/types";
import type { Tone } from "./constants";
import { ROUTES } from "./constants";
import { addDays, daysBetween, formatCurrency, formatDate, lastMonths, monthKey, monthLabel } from "./utils";

const sum = (values: (number | undefined)[]) => values.reduce<number>((acc, v) => acc + (v ?? 0), 0);

/* ---------- Locações ---------- */

export const rentalReceived = (r: Rental) => sum(r.receipts.filter((x) => x.paid).map((x) => x.amount));
export const rentalPending = (r: Rental, today: string) =>
  sum(r.receipts.filter((x) => !x.paid && x.dueDate <= today).map((x) => x.amount));
export const rentalDays = (r: Rental) => Math.max(1, daysBetween(r.startDate, r.endDate) + 1);
export const rentalKm = (r: Rental) => (r.kmStart != null && r.kmEnd != null ? r.kmEnd - r.kmStart : undefined);

/* ---------- Série mensal ---------- */

export interface MonthPoint {
  month: string;
  label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  locacoes: number;
}

/** Receitas = recebimentos pagos; despesas = despesas pagas + manutenções realizadas. */
export function monthlySeries(data: Collections, months: string[]): MonthPoint[] {
  const base = new Map(months.map((m) => [m, { receitas: 0, despesas: 0, locacoes: 0 }]));
  const add = (iso: string | undefined, field: "receitas" | "despesas" | "locacoes", value: number) => {
    const bucket = iso ? base.get(monthKey(iso)) : undefined;
    if (bucket) bucket[field] += value;
  };
  data.rentals.forEach((r) => {
    if (r.status !== "cancelled") add(r.startDate, "locacoes", 1);
    r.receipts.forEach((x) => x.paid && add(x.dueDate, "receitas", x.amount));
  });
  data.expenses.forEach((e) => e.paid && add(e.date, "despesas", e.amount));
  data.maintenance.forEach((m) => m.status === "done" && add(m.date, "despesas", m.amount ?? 0));
  return months.map((month) => {
    const b = base.get(month)!;
    return { month, label: monthLabel(month), ...b, saldo: b.receitas - b.despesas };
  });
}

export function inPeriod(iso: string | undefined, from?: string, to?: string) {
  if (!iso) return false;
  return (!from || iso >= from) && (!to || iso <= to);
}

/* ---------- Totais financeiros ---------- */

export function financeTotals(data: Collections, today: string, from?: string, to?: string) {
  const receipts = data.rentals.flatMap((r) => r.receipts);
  const receitas = sum(receipts.filter((x) => x.paid && inPeriod(x.dueDate, from, to)).map((x) => x.amount));
  const despesasPagas = sum(data.expenses.filter((e) => e.paid && inPeriod(e.date, from, to)).map((e) => e.amount));
  const manutencao = sum(
    data.maintenance.filter((m) => m.status === "done" && inPeriod(m.date, from, to)).map((m) => m.amount),
  );
  const despesas = despesasPagas + manutencao;
  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
    recebimentosPendentes: sum(receipts.filter((x) => !x.paid && x.dueDate <= today).map((x) => x.amount)),
    despesasPendentes: sum(data.expenses.filter((e) => !e.paid).map((e) => e.amount)),
  };
}

export function expensesByCategory(data: Collections, from?: string, to?: string) {
  const inRange = data.expenses.filter((e) => inPeriod(e.date, from, to));
  return [
    { name: "Recorrentes", value: sum(inRange.filter((e) => e.category === "recurring").map((e) => e.amount)) },
    { name: "Diversas", value: sum(inRange.filter((e) => e.category === "misc").map((e) => e.amount)) },
    {
      name: "Manutenção",
      value: sum(data.maintenance.filter((m) => m.status === "done" && inPeriod(m.date, from, to)).map((m) => m.amount)),
    },
    {
      name: "Multas pagas",
      value: sum(data.fines.filter((f) => f.status === "paid" && inPeriod(f.paymentDate, from, to)).map((f) => f.amountPaid)),
    },
  ].filter((c) => c.value > 0);
}

export const defaultMonths = () => lastMonths(6);

/* ---------- Alertas ---------- */

export interface Alert {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  href: string;
  date: string;
}

export function buildAlerts(data: Collections, settings: CompanySettings, today: string): Alert[] {
  const horizon = addDays(today, settings.alertWindowDays);
  const soon = (iso?: string) => !!iso && iso <= horizon;
  const alerts: Alert[] = [];
  const vehicle = (id: string) => data.vehicles.find((v) => v.id === id);

  if (settings.notifyFines) {
    data.fines
      .filter((f) => f.status !== "paid" && f.status !== "contested")
      .forEach((f) => {
        const plate = vehicle(f.vehicleId)?.plate ?? "";
        if (f.status === "identify" && soon(f.driverIdDeadline))
          alerts.push({
            id: `fine-id-${f.id}`,
            tone: "info",
            title: `Identificar condutor · ${plate}`,
            detail: `Prazo ${formatDate(f.driverIdDeadline)} — auto ${f.noticeNumber}`,
            href: ROUTES.fines,
            date: f.driverIdDeadline!,
          });
        if (soon(f.dueDate))
          alerts.push({
            id: `fine-due-${f.id}`,
            tone: f.dueDate < today ? "danger" : "warning",
            title: `${f.dueDate < today ? "Multa vencida" : "Multa a vencer"} · ${plate}`,
            detail: `${formatCurrency(f.amount)} — vencimento ${formatDate(f.dueDate)}`,
            href: ROUTES.fines,
            date: f.dueDate,
          });
      });
  }

  if (settings.notifyReceipts) {
    data.rentals.forEach((r) => {
      const late = r.receipts.filter((x) => !x.paid && x.dueDate < today);
      if (late.length && r.status !== "cancelled")
        alerts.push({
          id: `rec-${r.id}`,
          tone: "danger",
          title: `Recebimento em atraso · ${data.clients.find((c) => c.id === r.clientId)?.name ?? "Locatário"}`,
          detail: `${late.length} semana(s) — ${formatCurrency(sum(late.map((x) => x.amount)))}`,
          href: `${ROUTES.rentals}/${r.id}`,
          date: late[0].dueDate,
        });
    });
  }

  if (settings.notifyMaintenance) {
    data.maintenance
      .filter((m) => m.status !== "done" && soon(m.date))
      .forEach((m) =>
        alerts.push({
          id: `mnt-${m.id}`,
          tone: m.date < today ? "danger" : "warning",
          title: `Manutenção · ${vehicle(m.vehicleId)?.plate ?? ""}`,
          detail: `${m.description} — ${formatDate(m.date)}`,
          href: ROUTES.maintenance,
          date: m.date,
        }),
      );
  }

  data.clients
    .filter((c) => soon(c.cnhExpiry))
    .forEach((c) =>
      alerts.push({
        id: `cnh-${c.id}`,
        tone: c.cnhExpiry! < today ? "danger" : "warning",
        title: `${c.cnhExpiry! < today ? "CNH vencida" : "CNH a vencer"} · ${c.name}`,
        detail: `Vencimento ${formatDate(c.cnhExpiry)}`,
        href: ROUTES.clients,
        date: c.cnhExpiry!,
      }),
    );

  data.vehicles
    .filter((v) => v.status !== "sold" && (v.ipvaStatus !== "paid" || v.licensingStatus !== "paid"))
    .forEach((v) =>
      alerts.push({
        id: `doc-${v.id}`,
        tone: v.ipvaStatus === "late" || v.licensingStatus === "late" ? "danger" : "warning",
        title: `Documentação pendente · ${v.plate}`,
        detail: [v.ipvaStatus !== "paid" && "IPVA", v.licensingStatus !== "paid" && `Licenciamento (${v.licensingMonth ?? "—"})`]
          .filter(Boolean)
          .join(" · "),
        href: ROUTES.vehicles,
        date: today,
      }),
    );

  const weight: Record<Tone, number> = { danger: 0, warning: 1, info: 2, brand: 3, success: 4, neutral: 5 };
  return alerts.sort((a, b) => weight[a.tone] - weight[b.tone] || a.date.localeCompare(b.date));
}

/** Gera recebimentos semanais para uma nova locação (colunas RECEBIMENTOS da planilha). */
export function buildWeeklyReceipts(rental: Pick<Rental, "id" | "startDate" | "endDate" | "weeklyRate">) {
  const receipts: Rental["receipts"] = [];
  for (let due = rental.startDate, n = 1; due <= rental.endDate && n <= 104; due = addDays(due, 7), n++) {
    receipts.push({ id: `${rental.id}-r${n}`, dueDate: due, amount: rental.weeklyRate, paid: false });
  }
  return receipts;
}

/* ---------- CSV ---------- */

export function downloadCSV(filename: string, header: string[], rows: (string | number | undefined)[][]) {
  const escape = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
