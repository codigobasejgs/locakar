"use client";

import { CircleDollarSign, Clock, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { MoneyAreaChart, SimpleBarChart } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { financeTotals, monthlySeries } from "@/lib/analytics";
import { CHART_COLORS } from "@/lib/constants";
import { cn, formatCurrency, formatDate, lastMonths, todayISO } from "@/lib/utils";

const RANGES = [
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
];

export default function FinancePage() {
  const { data } = useAdminData();
  const { clientName, vehicleById } = useLookups();
  const [range, setRange] = useState("6");
  const today = todayISO();

  const view = useMemo(() => {
    const months = lastMonths(Number(range));
    const series = monthlySeries(data!, months);
    const flow = series.map((p, i) => ({ ...p, acumulado: series.slice(0, i + 1).reduce((a, x) => a + x.saldo, 0) }));
    const totals = financeTotals(data!, today, `${months[0]}-01`, today);

    const pendingReceipts = data!.rentals
      .flatMap((r) => r.receipts.filter((x) => !x.paid && x.dueDate <= today).map((x) => ({ ...x, clientId: r.clientId })))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const pendingExpenses = data!.expenses.filter((e) => !e.paid).sort((a, b) => a.date.localeCompare(b.date));
    return { series, flow, totals, pendingReceipts, pendingExpenses };
  }, [data, range, today]);

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Receitas de locações, despesas operacionais e saldo."
        actions={<Select aria-label="Período" value={range} onChange={(e) => setRange(e.target.value)} options={RANGES} className="w-48" />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Receitas" value={formatCurrency(view.totals.receitas)} icon={TrendingUp} accent />
        <StatCard label="Despesas" value={formatCurrency(view.totals.despesas)} icon={TrendingDown} hint="inclui manutenção" />
        <StatCard
          label="Saldo"
          value={<span className={cn(view.totals.saldo < 0 && "text-red-300")}>{formatCurrency(view.totals.saldo)}</span>}
          icon={Scale}
        />
        <StatCard label="Receb. pendentes" value={formatCurrency(view.totals.recebimentosPendentes)} icon={Clock} hint="vencidos e não pagos" />
        <StatCard label="Despesas pendentes" value={formatCurrency(view.totals.despesasPendentes)} icon={CircleDollarSign} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Receitas x despesas" description="Comparativo mensal" />
          <div className="p-3 sm:p-5">
            <SimpleBarChart
              data={view.series}
              xKey="label"
              currency
              series={[
                { key: "receitas", name: "Receitas", color: CHART_COLORS.brand },
                { key: "despesas", name: "Despesas", color: CHART_COLORS.white },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fluxo mensal" description="Saldo do mês e acumulado no período" />
          <div className="p-3 sm:p-5">
            <MoneyAreaChart
              data={view.flow}
              xKey="label"
              series={[
                { key: "acumulado", name: "Saldo acumulado", color: CHART_COLORS.brand },
                { key: "saldo", name: "Saldo do mês", color: CHART_COLORS.info },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recebimentos pendentes" description={`${view.pendingReceipts.length} lançamento(s)`} />
          <ul className="divide-y divide-line p-2">
            {view.pendingReceipts.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhum recebimento pendente.</li>}
            {view.pendingReceipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  <span className="block font-medium">{clientName(r.clientId)}</span>
                  <span className="block text-xs text-muted">Vencido em {formatDate(r.dueDate)}</span>
                </span>
                <span className="font-semibold tabular-nums text-red-300">{formatCurrency(r.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Despesas pendentes" description={`${view.pendingExpenses.length} lançamento(s)`} />
          <ul className="divide-y divide-line p-2">
            {view.pendingExpenses.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhuma despesa pendente.</li>}
            {view.pendingExpenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  <span className="block font-medium">{e.description}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(e.date)} · {e.vehicleId ? vehicleById.get(e.vehicleId)?.plate : "Frota"}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-amber-300">{formatCurrency(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
