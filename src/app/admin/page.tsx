"use client";
import { fipeFleet } from "@/lib/fipe";

import {
  CalendarDays,
  CalendarRange,
  CarFront,
  CircleDollarSign,
  Droplet,
  Eye,
  KeyRound,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DonutChart, MoneyAreaChart, SimpleBarChart } from "@/components/admin/charts";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { OnboardingCard } from "@/components/admin/onboarding-card";
import { PageHeader } from "@/components/admin/page-header";
import { Vehicle360Dialog } from "@/components/admin/vehicle-360-dialog";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import {
  buildAlerts,
  dashboardExecutiveTotals,
  defaultMonths,
  expensesByCategory,
  monthlySeries,
  presetDateRange,
  vehicle360,
  type DateRange,
} from "@/lib/analytics";
import { CHART_COLORS, RENTAL_STATUS, ROUTES, TONE_COLOR, VEHICLE_STATUS } from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber, todaySP } from "@/lib/utils";
import type { FleetVehicle, VehicleStatus } from "@/types";

const CATEGORY_COLORS = [CHART_COLORS.brand, CHART_COLORS.white, CHART_COLORS.brandSoft, CHART_COLORS.deep];

export default function DashboardPage() {
  const { data, settings } = useAdminData();
  const { clientName, vehicleLabel } = useLookups();
  const today = todaySP();

  const [range, setRange] = useState<DateRange>(() => presetDateRange("last_6_months", today));
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const count = (s: VehicleStatus) => data.vehicles.filter((v) => v.status === s).length;
    const months = defaultMonths();
    const series = monthlySeries(data, months);

    // Métricas executivas calculadas pelo período selecionado no filtro
    const execTotals = dashboardExecutiveTotals(data, today, range.from, range.to);

    // Resumo de desempenho para cada veículo da frota no período
    const vehiclePerformances = data.vehicles
      .filter((v) => v.status !== "sold")
      .map((v) => {
        const info = vehicle360(v, data, today, range.from, range.to);
        return { vehicle: v, info };
      })
      .sort((a, b) => b.info.faturamento - a.info.faturamento);

    return {
      execTotals,
      vehiclePerformances,
      series,
      occupancy: (Object.keys(VEHICLE_STATUS) as VehicleStatus[])
        .map((s) => ({ name: VEHICLE_STATUS[s].label, value: count(s), color: TONE_COLOR[VEHICLE_STATUS[s].tone] }))
        .filter((s) => s.value > 0),
      categories: expensesByCategory(data, range.from, range.to).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % 4] })),
      alerts: buildAlerts(data, settings, today).slice(0, 6),
      upcoming: data.reservations
        .filter((r) => r.endDate >= today && r.status !== "cancelled" && r.status !== "completed")
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 5),
      recentRentals: [...data.rentals].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 5),
    };
  }, [data, settings, today, range]);

  if (!view || !data) return null;
  const { execTotals } = view;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Visão geral da operação · ${new Date().toLocaleDateString("pt-BR", { dateStyle: "full" })}`}
      />

      <OnboardingCard />

      {data && <div className="mb-4 rounded-xl border border-line bg-panel p-4 text-sm"><p className="font-semibold">Valor FIPE da frota: {formatCurrency(fipeFleet(data.vehicles).total)}</p><p className="text-xs text-muted">Cobertura: {fipeFleet(data.vehicles).linked} de {fipeFleet(data.vehicles).applicable} veículos não vendidos. Referências mensais por veículo; não representa receita ou lucro.</p></div>}
      {/* Filtro flexível por qualquer data e período */}
      <DateRangeFilter range={range} today={today} onChange={setRange} />

      {/* Linha 1: Frota & Operação */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Total investido"
          value={formatCurrency(execTotals.fleetInvested)}
          icon={Wallet}
          hint={`em ${execTotals.fleetTotal} veículos ativos`}
          accent
        />
        <StatCard
          label="Disponíveis"
          value={execTotals.available}
          icon={CarFront}
          hint={`de ${execTotals.fleetTotal} veículos`}
        />
        <StatCard
          label="Alugados"
          value={execTotals.rented}
          icon={KeyRound}
          hint={`Ocupação ${execTotals.occupancyRate}%`}
        />
        <StatCard
          label="Locações ativas"
          value={execTotals.activeRentals}
          icon={KeyRound}
          hint="em andamento ou atrasadas"
        />
        <StatCard
          label="Reservas"
          value={execTotals.openReservations}
          icon={CalendarRange}
          hint="pendentes e confirmadas"
        />
      </div>

      {/* Linha 2: Indicadores Financeiros do Período Selecionado */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Faturamento recebido"
          value={formatCurrency(execTotals.faturamentoRecebido)}
          icon={CircleDollarSign}
          hint={`no período (${range.label})`}
          accent={execTotals.faturamentoRecebido > 0}
        />
        <StatCard
          label="Locações a vencer"
          value={formatCurrency(execTotals.locacoesAVencer)}
          icon={CalendarDays}
          hint="parcelas futuras no período"
        />
        <StatCard
          label="Valores em atraso"
          value={formatCurrency(execTotals.valoresEmAtraso)}
          icon={TriangleAlert}
          hint="vencidas com juros e multa"
          accent={execTotals.valoresEmAtraso > 0}
        />
        <StatCard
          label="Multas no período"
          value={formatCurrency(execTotals.multasValor)}
          icon={TriangleAlert}
          hint="infrações no período"
        />
        <StatCard
          label="Lucro líquido"
          value={formatCurrency(execTotals.lucroLiquido)}
          icon={execTotals.lucroLiquido >= 0 ? TrendingUp : TrendingDown}
          hint="faturamento - despesas"
          accent={execTotals.lucroLiquido > 0}
        />
      </div>

      {/* Seção Nova: Desempenho da Frota (com clique para visão 360°) */}
      <Card className="mt-6">
        <CardHeader
          title="Desempenho por veículo (Visão 360°)"
          description={`Clique em qualquer veículo para ver raio-X financeiro, trocas de óleo, vistorias, multas e histórico no período (${range.label}).`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={ROUTES.vehicles}>Ver cadastro da frota</Link>
            </Button>
          }
        />
        <div className="overflow-x-auto p-3 sm:p-5">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th className="pb-3 pr-3">Veículo</th>
                <th className="pb-3 pr-3">Status</th>
                <th className="pb-3 pr-3 text-right">Valor pago</th>
                <th className="pb-3 pr-3 text-right">Faturamento</th>
                <th className="pb-3 pr-3 text-right">Custos</th>
                <th className="pb-3 pr-3 text-right">Lucro líq.</th>
                <th className="pb-3 pr-3">Troca de óleo</th>
                <th className="pb-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.vehiclePerformances.map(({ vehicle: v, info }) => {
                const oil = info.oilChange;
                return (
                  <tr
                    key={v.id}
                    onClick={() => setSelectedVehicle(v)}
                    className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        {v.image && (
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line bg-white/5">
                            <Image src={v.image} alt={v.name} fill sizes="40px" className="object-contain p-0.5" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-white">{v.name}</p>
                          <p className="text-xs font-bold text-brand-soft">{v.plate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge map={VEHICLE_STATUS} value={v.status} />
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-zinc-300">
                      {info.purchaseValue ? formatCurrency(info.purchaseValue) : "—"}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums font-medium text-emerald-300">
                      {formatCurrency(info.faturamento)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-red-300">
                      {formatCurrency(info.custos)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums font-bold">
                      <span className={info.lucro >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {formatCurrency(info.lucro)}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Droplet className={`size-3.5 ${oil.status === "ok" ? "text-emerald-400" : oil.status === "overdue" ? "text-red-400" : "text-amber-400"}`} />
                        <span className="text-xs">
                          {oil.status === "ok" && "Em dia"}
                          {oil.status === "near" && "Próxima"}
                          {oil.status === "overdue" && <strong className="text-red-400">Vencida!</strong>}
                          {oil.status === "unknown" && "—"}
                          {oil.kmUntilNext != null && oil.status !== "unknown" && (
                            <span className="text-[11px] text-zinc-500"> ({formatNumber(oil.kmUntilNext)} km)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVehicle(v);
                        }}
                      >
                        <Eye className="size-3" /> Visão 360°
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gráficos e Distribuições */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Receitas x despesas" description={`Série mensal histórica · período ativo: ${range.label}`} />
          <div className="p-3 sm:p-5">
            <MoneyAreaChart
              data={view.series}
              xKey="label"
              series={[
                { key: "receitas", name: "Receitas", color: CHART_COLORS.brand },
                { key: "despesas", name: "Despesas", color: CHART_COLORS.white },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Ocupação da frota" description="Status atual dos veículos" />
          <div className="p-3 sm:p-5">
            <DonutChart data={view.occupancy} centerLabel="veículos" />
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Locações por mês" description="Contratos iniciados" />
          <div className="p-3 sm:p-5">
            <SimpleBarChart data={view.series} xKey="label" series={[{ key: "locacoes", name: "Locações", color: CHART_COLORS.brand }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Despesas por categoria" description={`No período (${range.label})`} />
          <div className="p-3 sm:p-5">
            <DonutChart data={view.categories} currency centerLabel="total" />
          </div>
        </Card>
      </div>

      {/* Alertas, Reservas e Locações Recentes */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Alertas" description="Vencimentos e pendências" />
          <ul className="p-3">
            {view.alerts.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">Tudo em dia.</li>}
            {view.alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[a.tone] }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    <span className="block truncate text-xs text-muted">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Próximas reservas"
            action={<Link href={ROUTES.reservations} className="text-xs font-semibold text-brand-soft hover:underline">Ver todas</Link>}
          />
          <ul className="p-3">
            {view.upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{clientName(r.clientId)}</span>
                  <span className="block truncate text-xs text-muted">{vehicleLabel(r.vehicleId)}</span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-zinc-300">
                  {formatDate(r.startDate)}
                  <br />
                  <span className="text-zinc-500">até {formatDate(r.endDate)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Locações recentes"
            action={<Link href={ROUTES.rentals} className="text-xs font-semibold text-brand-soft hover:underline">Ver todas</Link>}
          />
          <ul className="p-3">
            {view.recentRentals.map((r) => (
              <li key={r.id}>
                <Link href={`${ROUTES.rentals}/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{clientName(r.clientId)}</span>
                    <span className="block truncate text-xs text-muted">{vehicleLabel(r.vehicleId)}</span>
                  </span>
                  <Badge tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Modal de Visão 360° do Veículo */}
      <Vehicle360Dialog
        vehicle={selectedVehicle}
        data={data}
        today={today}
        dashboardRange={range}
        onClose={() => setSelectedVehicle(null)}
      />
    </>
  );
}
