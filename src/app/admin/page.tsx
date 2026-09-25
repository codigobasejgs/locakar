"use client";

import {
  CalendarDays,
  CarFront,
  CircleDollarSign,
  KeyRound,
  Receipt,
  TrendingDown,
  TriangleAlert,
  Wrench,
  CalendarRange,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DonutChart, MoneyAreaChart, SimpleBarChart } from "@/components/admin/charts";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { buildAlerts, defaultMonths, expensesByCategory, financeTotals, monthlySeries } from "@/lib/analytics";
import { CHART_COLORS, RENTAL_STATUS, ROUTES, TONE_COLOR, VEHICLE_STATUS } from "@/lib/constants";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import type { VehicleStatus } from "@/types";

const CATEGORY_COLORS = [CHART_COLORS.brand, CHART_COLORS.white, CHART_COLORS.brandSoft, CHART_COLORS.deep];

export default function DashboardPage() {
  const { data, settings } = useAdminData();
  const { clientName, vehicleLabel } = useLookups();
  const today = todayISO();

  const view = useMemo(() => {
    if (!data) return null;
    const count = (s: VehicleStatus) => data.vehicles.filter((v) => v.status === s).length;
    const months = defaultMonths();
    const series = monthlySeries(data, months);
    const totals = financeTotals(data, today, `${months[0]}-01`, today);
    return {
      available: count("available"),
      rented: count("rented"),
      reserved: count("reserved"),
      maintenanceVehicles: count("maintenance"),
      activeRentals: data.rentals.filter((r) => r.status === "active" || r.status === "late").length,
      openReservations: data.reservations.filter((r) => r.status === "pending" || r.status === "confirmed").length,
      openMaintenance: data.maintenance.filter((m) => m.status !== "done").length,
      openFines: data.fines.filter((f) => f.status !== "paid").length,
      totals,
      series,
      occupancy: (Object.keys(VEHICLE_STATUS) as VehicleStatus[])
        .map((s) => ({ name: VEHICLE_STATUS[s].label, value: count(s), color: TONE_COLOR[VEHICLE_STATUS[s].tone] }))
        .filter((s) => s.value > 0),
      categories: expensesByCategory(data, `${months[0]}-01`, today).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % 4] })),
      alerts: buildAlerts(data, settings, today).slice(0, 6),
      upcoming: data.reservations
        .filter((r) => r.endDate >= today && r.status !== "cancelled" && r.status !== "completed")
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 5),
      recentRentals: [...data.rentals].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 5),
      fleetTotal: data.vehicles.filter((v) => v.status !== "sold").length,
    };
  }, [data, settings, today]);

  if (!view) return null;
  const occupancyRate = view.fleetTotal ? Math.round(((view.rented + view.reserved) / view.fleetTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Visão geral da operação · ${new Date().toLocaleDateString("pt-BR", { dateStyle: "full" })}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Disponíveis" value={view.available} icon={CarFront} hint={`de ${view.fleetTotal} veículos ativos`} accent />
        <StatCard label="Alugados" value={view.rented} icon={KeyRound} hint={`Ocupação ${occupancyRate}%`} />
        <StatCard label="Reservados" value={view.reserved} icon={CalendarRange} />
        <StatCard label="Locações ativas" value={view.activeRentals} icon={KeyRound} />
        <StatCard label="Reservas" value={view.openReservations} icon={CalendarDays} hint="pendentes e confirmadas" />
        <StatCard label="Receitas (6m)" value={formatCurrency(view.totals.receitas)} icon={CircleDollarSign} hint="recebimentos pagos" />
        <StatCard label="Despesas (6m)" value={formatCurrency(view.totals.despesas)} icon={TrendingDown} hint="inclui manutenção" />
        <StatCard label="Saldo (6m)" value={formatCurrency(view.totals.saldo)} icon={Receipt} />
        <StatCard label="Manutenções" value={view.openMaintenance} icon={Wrench} hint={`${view.maintenanceVehicles} veículo(s) parado(s)`} />
        <StatCard label="Multas em aberto" value={view.openFines} icon={TriangleAlert} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Receitas x despesas" description="Últimos 6 meses" />
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
          <CardHeader title="Despesas por categoria" description="Últimos 6 meses" />
          <div className="p-3 sm:p-5">
            <DonutChart data={view.categories} currency centerLabel="total" />
          </div>
        </Card>
      </div>

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
    </>
  );
}
