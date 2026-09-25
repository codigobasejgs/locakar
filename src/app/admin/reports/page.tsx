"use client";

import { Download, Printer, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DonutChart, SimpleBarChart } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { downloadCSV, expensesByCategory, inPeriod, monthlySeries, rentalKm, rentalReceived } from "@/lib/analytics";
import {
  CHART_COLORS,
  EXPENSE_CATEGORY,
  FINE_STATUS,
  MAINTENANCE_STATUS,
  RENTAL_STATUS,
  RESERVATION_STATUS,
  TONE_COLOR,
  VEHICLE_STATUS,
  type Tone,
} from "@/lib/constants";
import { addDays, cn, formatCurrency, formatDate, formatNumber, lastMonths, monthLabel, todayISO } from "@/lib/utils";

const REPORTS = [
  { key: "fleet", label: "Frota" },
  { key: "rentals", label: "Locações" },
  { key: "revenue", label: "Receitas" },
  { key: "expenses", label: "Despesas" },
  { key: "maintenance", label: "Manutenção" },
  { key: "fines", label: "Multas" },
  { key: "reservations", label: "Reservas" },
] as const;
type ReportKey = (typeof REPORTS)[number]["key"];

const STATUS_BY_REPORT: Partial<Record<ReportKey, Record<string, { label: string; tone: Tone }>>> = {
  fleet: VEHICLE_STATUS,
  rentals: RENTAL_STATUS,
  maintenance: MAINTENANCE_STATUS,
  fines: FINE_STATUS,
  reservations: RESERVATION_STATUS,
};

interface Row {
  id: string;
  cells: React.ReactNode[];
  csv: (string | number | undefined)[];
  amount?: number;
}

function countBy<T>(items: T[], key: (t: T) => string, map: Record<string, { label: string; tone: Tone }>) {
  return Object.entries(map)
    .map(([k, s]) => ({ name: s.label, value: items.filter((i) => key(i) === k).length, color: TONE_COLOR[s.tone] }))
    .filter((s) => s.value > 0);
}

export default function ReportsPage() {
  const { data } = useAdminData();
  const { clientName, vehicleById, vehicleOptions } = useLookups();
  const today = todayISO();
  const [report, setReport] = useState<ReportKey>("rentals");
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState(addDays(today, -180));
  const [to, setTo] = useState(addDays(today, 60));
  const [vehicle, setVehicle] = useState("");
  const [status, setStatus] = useState("");

  const start = month ? `${month}-01` : from;
  const end = month ? `${month}-31` : to;
  const plate = useCallback((id?: string) => (id ? (vehicleById.get(id)?.plate ?? "—") : "Frota"), [vehicleById]);
  const statusMap = STATUS_BY_REPORT[report];

  const result = useMemo(() => {
    const d = data!;
    const byVehicle = <T extends { vehicleId?: string }>(t: T) => !vehicle || t.vehicleId === vehicle;
    const byStatus = <T extends { status: string }>(t: T) => !status || t.status === status;
    const months = lastMonths(12).filter((m) => m >= start.slice(0, 7) && m <= end.slice(0, 7));

    switch (report) {
      case "fleet": {
        const list = d.vehicles.filter((v) => (!vehicle || v.id === vehicle) && byStatus(v));
        return {
          header: ["Placa", "Veículo", "Ano/modelo", "Status", "IPVA", "Licenciamento", "Valor de compra"],
          rows: list.map<Row>((v) => ({
            id: v.id,
            amount: v.purchaseValue,
            cells: [v.plate, v.name, v.yearModel ?? v.year, <StatusBadge key="s" map={VEHICLE_STATUS} value={v.status} />, v.ipvaStatus === "paid" ? "Pago" : "Pendente", `${v.licensingMonth ?? "—"} · ${v.licensingStatus === "paid" ? "Pago" : "Pendente"}`, formatCurrency(v.purchaseValue)],
            csv: [v.plate, v.name, v.yearModel, VEHICLE_STATUS[v.status].label, v.ipvaStatus, v.licensingStatus, v.purchaseValue],
          })),
          chart: { type: "donut" as const, data: countBy(list, (v) => v.status, VEHICLE_STATUS), label: "veículos" },
          totalLabel: "Patrimônio (valor de compra)",
        };
      }
      case "rentals": {
        const list = d.rentals.filter((r) => byVehicle(r) && byStatus(r) && r.startDate <= end && r.endDate >= start);
        return {
          header: ["Locatário", "Placa", "Início", "Fim", "Status", "KM rodado", "Recebido"],
          rows: list.map<Row>((r) => ({
            id: r.id,
            amount: rentalReceived(r),
            cells: [clientName(r.clientId), plate(r.vehicleId), formatDate(r.startDate), formatDate(r.endDate), <StatusBadge key="s" map={RENTAL_STATUS} value={r.status} />, formatNumber(rentalKm(r)), formatCurrency(rentalReceived(r))],
            csv: [clientName(r.clientId), plate(r.vehicleId), r.startDate, r.endDate, RENTAL_STATUS[r.status].label, rentalKm(r), rentalReceived(r)],
          })),
          chart: { type: "donut" as const, data: countBy(list, (r) => r.status, RENTAL_STATUS), label: "locações" },
          totalLabel: "Total recebido",
        };
      }
      case "revenue": {
        const list = d.rentals
          .filter(byVehicle)
          .flatMap((r) => r.receipts.filter((x) => x.paid && inPeriod(x.dueDate, start, end)).map((x) => ({ ...x, r })));
        return {
          header: ["Data", "Locatário", "Placa", "Valor"],
          rows: list
            .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
            .map<Row>((x) => ({
              id: x.id,
              amount: x.amount,
              cells: [formatDate(x.dueDate), clientName(x.r.clientId), plate(x.r.vehicleId), formatCurrency(x.amount)],
              csv: [x.dueDate, clientName(x.r.clientId), plate(x.r.vehicleId), x.amount],
            })),
          chart: { type: "bar" as const, data: monthlySeries({ ...d, rentals: d.rentals.filter(byVehicle) }, months), key: "receitas" },
          totalLabel: "Receitas no período",
        };
      }
      case "expenses": {
        const list = d.expenses.filter((e) => byVehicle(e) && inPeriod(e.date, start, end));
        return {
          header: ["Data", "Descrição", "Placa", "Categoria", "Pago", "Valor"],
          rows: list.map<Row>((e) => ({
            id: e.id,
            amount: e.amount,
            cells: [formatDate(e.date), e.description, plate(e.vehicleId), EXPENSE_CATEGORY[e.category], e.paid ? "Sim" : "Não", formatCurrency(e.amount)],
            csv: [e.date, e.description, plate(e.vehicleId), EXPENSE_CATEGORY[e.category], e.paid ? "Sim" : "Não", e.amount],
          })),
          chart: {
            type: "donut" as const,
            data: expensesByCategory({ ...d, expenses: list, maintenance: [], fines: [] }).map((c, i) => ({ ...c, color: [CHART_COLORS.brand, CHART_COLORS.white][i] ?? CHART_COLORS.muted })),
            label: "total",
            currency: true,
          },
          totalLabel: "Total de despesas",
        };
      }
      case "maintenance": {
        const list = d.maintenance.filter((m) => byVehicle(m) && byStatus(m) && inPeriod(m.date, start, end));
        return {
          header: ["Data", "Placa", "Descrição", "KM atual", "Status", "Valor"],
          rows: list.map<Row>((m) => ({
            id: m.id,
            amount: m.amount,
            cells: [formatDate(m.date), plate(m.vehicleId), m.description, formatNumber(m.currentKm), <StatusBadge key="s" map={MAINTENANCE_STATUS} value={m.status} />, formatCurrency(m.amount)],
            csv: [m.date, plate(m.vehicleId), m.description, m.currentKm, MAINTENANCE_STATUS[m.status].label, m.amount],
          })),
          chart: { type: "donut" as const, data: countBy(list, (m) => m.status, MAINTENANCE_STATUS), label: "manutenções" },
          totalLabel: "Custo total",
        };
      }
      case "fines": {
        const list = d.fines.filter((f) => byVehicle(f) && byStatus(f) && inPeriod(f.infractionDate, start, end));
        return {
          header: ["Autuação", "Auto", "Placa", "Locatário", "Status", "Valor"],
          rows: list.map<Row>((f) => ({
            id: f.id,
            amount: f.amount,
            cells: [formatDate(f.infractionDate), f.noticeNumber, plate(f.vehicleId), clientName(f.clientId), <StatusBadge key="s" map={FINE_STATUS} value={f.status} />, formatCurrency(f.amount)],
            csv: [f.infractionDate, f.noticeNumber, plate(f.vehicleId), clientName(f.clientId), FINE_STATUS[f.status].label, f.amount],
          })),
          chart: { type: "donut" as const, data: countBy(list, (f) => f.status, FINE_STATUS), label: "multas" },
          totalLabel: "Valor total",
        };
      }
      case "reservations": {
        const list = d.reservations.filter((r) => byVehicle(r) && byStatus(r) && r.startDate <= end && r.endDate >= start);
        return {
          header: ["Locatário", "Placa", "Início", "Fim", "Status"],
          rows: list.map<Row>((r) => ({
            id: r.id,
            cells: [clientName(r.clientId), plate(r.vehicleId), formatDate(r.startDate), formatDate(r.endDate), <StatusBadge key="s" map={RESERVATION_STATUS} value={r.status} />],
            csv: [clientName(r.clientId), plate(r.vehicleId), r.startDate, r.endDate, RESERVATION_STATUS[r.status].label],
          })),
          chart: { type: "donut" as const, data: countBy(list, (r) => r.status, RESERVATION_STATUS), label: "reservas" },
          totalLabel: undefined,
        };
      }
    }
  }, [data, report, start, end, vehicle, status, clientName, plate]);

  const total = result.rows.reduce((acc, r) => acc + (r.amount ?? 0), 0);
  const title = REPORTS.find((r) => r.key === report)!.label;

  const reset = () => {
    setMonth("");
    setFrom(addDays(today, -180));
    setTo(addDays(today, 60));
    setVehicle("");
    setStatus("");
  };

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Relatórios visuais com filtros por mês, período, veículo e status."
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
            <Button onClick={() => downloadCSV(`locakar-${report}-${today}.csv`, result.header, result.rows.map((r) => r.csv))}>
              <Download /> Exportar CSV
            </Button>
          </>
        }
      />

      <div className="no-print mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-panel p-1" role="tablist" aria-label="Tipo de relatório">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={report === r.key}
            onClick={() => {
              setReport(r.key);
              setStatus("");
            }}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              report === r.key ? "bg-gradient-to-b from-magenta to-brand text-white" : "text-muted hover:bg-white/5 hover:text-white",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card className="no-print mb-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Mês" htmlFor="r-month">
          <Select
            id="r-month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            options={lastMonths(12).reverse().map((m) => ({ value: m, label: monthLabel(m) }))}
            placeholder="Período personalizado"
          />
        </Field>
        <Field label="De" htmlFor="r-from">
          <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!!month} />
        </Field>
        <Field label="Até" htmlFor="r-to">
          <Input id="r-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} disabled={!!month} />
        </Field>
        <Field label="Veículo" htmlFor="r-vehicle">
          <Select id="r-vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} options={vehicleOptions} placeholder="Todos" />
        </Field>
        <Field label="Status" htmlFor="r-status">
          <Select
            id="r-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={statusMap ? Object.entries(statusMap).map(([value, s]) => ({ value, label: s.label })) : []}
            placeholder={statusMap ? "Todos" : "Não se aplica"}
            disabled={!statusMap}
          />
        </Field>
        <div className="flex items-end">
          <Button variant="ghost" className="w-full" onClick={reset}>
            <RotateCcw /> Limpar filtros
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={`Relatório de ${title}`}
            description={month ? monthLabel(month) : `${formatDate(from)} a ${formatDate(to)}`}
          />
          <div className="p-3 sm:p-5">
            {result.chart.type === "bar" ? (
              <SimpleBarChart data={result.chart.data} xKey="label" currency series={[{ key: result.chart.key, name: "Receitas", color: CHART_COLORS.brand }]} />
            ) : result.chart.data.length ? (
              <DonutChart data={result.chart.data} centerLabel={result.chart.label} currency={"currency" in result.chart} />
            ) : (
              <p className="py-20 text-center text-sm text-muted">Sem dados no filtro atual.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-line p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Registros</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{result.rows.length}</p>
            </div>
            {result.totalLabel && (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">{result.totalLabel}</p>
                <p className="font-display text-2xl font-semibold tabular-nums">{formatCurrency(total)}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm" aria-label={`Relatório de ${title}`}>
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
                  {result.header.map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-white/[0.02]">
                    {r.cells.map((c, i) => (
                      <td key={i} className="whitespace-nowrap px-4 py-3 text-zinc-200">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length === 0 && <p className="py-14 text-center text-sm text-muted">Nenhum registro no filtro atual.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
