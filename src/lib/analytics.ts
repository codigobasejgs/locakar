/** Cálculos de indicadores a partir das coleções (puro, sem React). */
import type { Collections } from "@/repositories/types";
import type { CompanySettings, FleetVehicle, Rental } from "@/types";
import { billingOf, lateCharges } from "./billing";
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

/* ---------- Filtros de Período do Dashboard ---------- */

export type DatePresetKey =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "all"
  | "custom";

export interface DateRange {
  key: DatePresetKey;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  label: string;
}

export function presetDateRange(key: DatePresetKey, today: string, customFrom?: string, customTo?: string): DateRange {
  const [y, m, d] = today.split("-").map(Number);
  const now = new Date(y, m - 1, d);

  if (key === "today") {
    return { key, from: today, to: today, label: "Hoje" };
  }

  if (key === "this_week") {
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = addDays(today, diffToMonday);
    const sunday = addDays(monday, 6);
    return { key, from: monday, to: sunday, label: "Esta semana" };
  }

  if (key === "this_month") {
    const from = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    return { key, from, to, label: "Este mês" };
  }

  if (key === "last_month") {
    const prev = new Date(y, m - 2, 1);
    const py = prev.getFullYear();
    const pm = prev.getMonth() + 1;
    const from = `${py}-${String(pm).padStart(2, "0")}-01`;
    const lastDay = new Date(py, pm, 0).getDate();
    const to = `${py}-${String(pm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { key, from, to, label: "Mês passado" };
  }

  if (key === "last_3_months") {
    const months = lastMonths(3, today);
    return { key, from: `${months[0]}-01`, to: today, label: "Últimos 3 meses" };
  }

  if (key === "last_6_months") {
    const months = lastMonths(6, today);
    return { key, from: `${months[0]}-01`, to: today, label: "Últimos 6 meses" };
  }

  if (key === "this_year") {
    return { key, from: `${y}-01-01`, to: `${y}-12-31`, label: "Este ano" };
  }

  if (key === "all") {
    return { key, from: undefined, to: undefined, label: "Todo o histórico" };
  }

  return { key: "custom", from: customFrom || today, to: customTo || today, label: "Personalizado" };
}

/* ---------- Indicadores Executivos do Dashboard ---------- */

export interface ExecutiveTotals {
  fleetInvested: number;
  fleetTotal: number;
  available: number;
  rented: number;
  reserved: number;
  maintenanceVehicles: number;
  occupancyRate: number;
  activeRentals: number;
  openReservations: number;
  openMaintenance: number;
  openFines: number;
  faturamentoRecebido: number;
  locacoesAVencer: number;
  valoresEmAtraso: number;
  multasValor: number;
  despesasTotal: number;
  lucroLiquido: number;
}

export function dashboardExecutiveTotals(data: Collections, today: string, from?: string, to?: string): ExecutiveTotals {
  const activeVehicles = data.vehicles.filter((v) => v.status !== "sold");
  const fleetInvested = sum(activeVehicles.map((v) => v.purchaseValue));
  const count = (s: string) => data.vehicles.filter((v) => v.status === s).length;
  const available = count("available");
  const rented = count("rented");
  const reserved = count("reserved");
  const maintenanceVehicles = count("maintenance");
  const fleetTotal = activeVehicles.length;
  const occupancyRate = fleetTotal ? Math.round(((rented + reserved) / fleetTotal) * 100) : 0;
  const activeRentals = data.rentals.filter((r) => r.status === "active" || r.status === "late").length;
  const openReservations = data.reservations.filter((r) => r.status === "pending" || r.status === "confirmed").length;
  const openMaintenance = data.maintenance.filter((m) => m.status !== "done").length;
  const openFines = data.fines.filter((f) => f.status !== "paid").length;

  let faturamentoRecebido = 0;
  let locacoesAVencer = 0;
  let valoresEmAtraso = 0;

  for (const r of data.rentals) {
    if (r.status === "cancelled") continue;
    const billing = billingOf(r);
    for (const x of r.receipts) {
      const receiptDate = x.paidAt || x.dueDate;
      if (x.paid) {
        if (inPeriod(receiptDate, from, to)) {
          faturamentoRecebido += x.amountPaid ?? x.amount;
        }
      } else {
        if (x.dueDate < today) {
          if (inPeriod(x.dueDate, from, to)) {
            const ch = lateCharges(x.amount, x.dueDate, today, billing);
            valoresEmAtraso += ch.total;
          }
        } else {
          if (inPeriod(x.dueDate, from, to)) {
            locacoesAVencer += x.amount;
          }
        }
      }
    }
  }

  const multasValor = sum(
    data.fines.filter((f) => inPeriod(f.infractionDate, from, to) || inPeriod(f.dueDate, from, to)).map((f) => f.amount)
  );

  const despesasPagas = sum(data.expenses.filter((e) => e.paid && inPeriod(e.date, from, to)).map((e) => e.amount));
  const manutencaoPaga = sum(data.maintenance.filter((m) => m.status === "done" && inPeriod(m.date, from, to)).map((m) => m.amount));
  const despesasTotal = despesasPagas + manutencaoPaga;
  const lucroLiquido = faturamentoRecebido - despesasTotal;

  return {
    fleetInvested,
    fleetTotal,
    available,
    rented,
    reserved,
    maintenanceVehicles,
    occupancyRate,
    activeRentals,
    openReservations,
    openMaintenance,
    openFines,
    faturamentoRecebido,
    locacoesAVencer,
    valoresEmAtraso,
    multasValor,
    despesasTotal,
    lucroLiquido,
  };
}

/* ---------- Visão 360° do Veículo ---------- */

export interface Vehicle360Data {
  vehicle: FleetVehicle;
  purchaseValue: number;
  faturamento: number;
  custos: number;
  lucro: number;
  roi: number | null;
  activeRental: Rental | null;
  rentals: { rental: Rental; clientName: string; totalReceived: number; totalPending: number }[];
  maintenances: Collections["maintenance"];
  oilChange: {
    lastDate?: string;
    lastKm?: number;
    currentKm?: number;
    nextKm?: number;
    kmUntilNext?: number;
    status: "ok" | "near" | "overdue" | "unknown";
  };
  fines: Collections["fines"];
  inspections: {
    delivery?: Rental["deliveryInspection"];
    return?: Rental["returnInspection"];
  }[];
}

export function vehicle360(
  vehicle: FleetVehicle,
  data: Collections,
  today: string,
  from?: string,
  to?: string
): Vehicle360Data {
  const purchaseValue = vehicle.purchaseValue ?? 0;
  const vehicleRentals = data.rentals.filter((r) => r.vehicleId === vehicle.id && r.status !== "cancelled");
  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? "Cliente";

  let faturamento = 0;
  const rentalsSummary = vehicleRentals.map((r) => {
    let rec = 0;
    let pend = 0;
    for (const x of r.receipts) {
      if (x.paid) {
        if (inPeriod(x.paidAt || x.dueDate, from, to)) {
          rec += x.amountPaid ?? x.amount;
        }
      } else {
        if (inPeriod(x.dueDate, from, to)) {
          pend += x.amount;
        }
      }
    }
    faturamento += rec;
    return { rental: r, clientName: clientName(r.clientId), totalReceived: rec, totalPending: pend };
  });

  const vehicleExpenses = data.expenses.filter((e) => e.vehicleId === vehicle.id && e.paid && inPeriod(e.date, from, to));
  const vehicleMaintenances = data.maintenance.filter((m) => m.vehicleId === vehicle.id);
  const doneMaintenancesPeriod = vehicleMaintenances.filter((m) => m.status === "done" && inPeriod(m.date, from, to));

  const custos = sum(vehicleExpenses.map((e) => e.amount)) + sum(doneMaintenancesPeriod.map((m) => m.amount));
  const lucro = faturamento - custos;
  const roi = purchaseValue > 0 ? Math.round((lucro / purchaseValue) * 1000) / 10 : null;

  const activeRental = vehicleRentals.find((r) => r.status === "active" || r.status === "late") ?? null;

  const oilMaintenances = vehicleMaintenances
    .filter((m) => /óleo|oleo|revis/i.test(m.description) && m.status === "done")
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastOil = oilMaintenances[0];

  const latestKm = Math.max(
    0,
    ...vehicleRentals.map((r) => r.kmEnd ?? r.kmStart ?? 0),
    ...vehicleMaintenances.map((m) => m.currentKm ?? 0)
  );

  let oilStatus: "ok" | "near" | "overdue" | "unknown" = "unknown";
  let kmUntilNext: number | undefined;

  if (lastOil?.nextKm && latestKm > 0) {
    kmUntilNext = lastOil.nextKm - latestKm;
    if (kmUntilNext <= 0) oilStatus = "overdue";
    else if (kmUntilNext <= 1000) oilStatus = "near";
    else oilStatus = "ok";
  }

  const fines = data.fines.filter((f) => f.vehicleId === vehicle.id && (inPeriod(f.infractionDate, from, to) || inPeriod(f.dueDate, from, to)));

  const inspections = vehicleRentals
    .filter((r) => r.deliveryInspection || r.returnInspection)
    .map((r) => ({ delivery: r.deliveryInspection, return: r.returnInspection }));

  return {
    vehicle,
    purchaseValue,
    faturamento,
    custos,
    lucro,
    roi,
    activeRental,
    rentals: rentalsSummary,
    maintenances: vehicleMaintenances.sort((a, b) => b.date.localeCompare(a.date)),
    oilChange: {
      lastDate: lastOil?.date,
      lastKm: lastOil?.currentKm,
      currentKm: latestKm > 0 ? latestKm : undefined,
      nextKm: lastOil?.nextKm,
      kmUntilNext,
      status: oilStatus,
    },
    fines,
    inspections,
  };
}

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
