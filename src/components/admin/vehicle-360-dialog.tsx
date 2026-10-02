"use client";

import {
  CircleDollarSign,
  ClipboardCheck,
  Droplet,
  KeyRound,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { VehicleFipePanel } from "./vehicle-fipe-panel";
import { vehicle360, type DateRange } from "@/lib/analytics";
import { FUEL_LABEL } from "@/lib/contract";
import { FINE_STATUS, MAINTENANCE_STATUS, RENTAL_STATUS, ROUTES, VEHICLE_STATUS } from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { Collections } from "@/repositories/types";
import type { FleetVehicle } from "@/types";

interface Vehicle360DialogProps {
  vehicle: FleetVehicle | null;
  data: Collections;
  today: string;
  dashboardRange: DateRange;
  onClose: () => void;
}

export function Vehicle360Dialog({ vehicle, data, today, dashboardRange, onClose }: Vehicle360DialogProps) {
  const [useAllTime, setUseAllTime] = useState(false);
  const [tab, setTab] = useState<"locacoes" | "manutencao" | "vistorias" | "multas">("locacoes");

  const from = useAllTime ? undefined : dashboardRange.from;
  const to = useAllTime ? undefined : dashboardRange.to;

  const info = useMemo(() => {
    if (!vehicle) return null;
    return vehicle360(vehicle, data, today, from, to);
  }, [vehicle, data, today, from, to]);

  if (!vehicle || !info) return null;

  const oil = info.oilChange;
  const isProfitable = info.lucro >= 0;

  return (
    <Dialog
      open={!!vehicle}
      onOpenChange={(open) => !open && onClose()}
      title={`Visão 360° · ${vehicle.name} (${vehicle.plate})`}
      description="Raio-X completo: lucratividade, custos, manutenções, vistorias e multas."
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {/* Cabeçalho do Carro */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-center gap-4">
            {vehicle.image && (
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-white/5">
                <Image
                  src={vehicle.image}
                  alt={vehicle.name}
                  fill
                  sizes="80px"
                  className="object-contain p-1"
                />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl font-bold text-white">{vehicle.name}</h3>
                <StatusBadge map={VEHICLE_STATUS} value={vehicle.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Placa: <span className="font-bold text-brand-soft">{vehicle.plate}</span> · {vehicle.category} · {vehicle.transmission} · {vehicle.fuel}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Valor pago na compra: <strong className="text-white">{formatCurrency(info.purchaseValue)}</strong>
                {vehicle.purchaseDate ? ` em ${formatDate(vehicle.purchaseDate)}` : ""}
                {vehicle.year ? ` · Ano ${vehicle.year}/${vehicle.yearModel || vehicle.year}` : ""}
              </p>
            </div>
          </div>

          {/* Toggle de período do veículo */}
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-panel p-1 text-xs">
            <button
              onClick={() => setUseAllTime(false)}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${!useAllTime ? "bg-magenta/25 text-white" : "text-muted hover:text-white"}`}
            >
              Filtro atual ({dashboardRange.label})
            </button>
            <button
              onClick={() => setUseAllTime(true)}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${useAllTime ? "bg-magenta/25 text-white" : "text-muted hover:text-white"}`}
            >
              Todo o histórico
            </button>
          </div>
        </div>

        {/* 4 StatCards Financeiros do Veículo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Faturamento"
            value={formatCurrency(info.faturamento)}
            icon={CircleDollarSign}
            hint="receitas recebidas"
            accent={info.faturamento > 0}
          />
          <StatCard
            label="Custos do carro"
            value={formatCurrency(info.custos)}
            icon={TrendingDown}
            hint="manutenção + despesas"
          />
          <StatCard
            label="Lucro líquido"
            value={formatCurrency(info.lucro)}
            icon={isProfitable ? TrendingUp : TrendingDown}
            hint={isProfitable ? "resultado positivo" : "resultado negativo"}
            accent={isProfitable && info.lucro > 0}
          />
          <StatCard
            label="Retorno (ROI)"
            value={info.roi != null ? `${info.roi}%` : "—"}
            icon={CircleDollarSign}
            hint={info.purchaseValue > 0 ? "sobre o valor de compra" : "cadastre o valor pago"}
          />
        </div>

        <VehicleFipePanel vehicleId={vehicle.id} />

        {/* Card Especial: Troca de Óleo e Revisões Mecânicas */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-gradient-to-r from-amber-500/10 via-panel to-panel p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/25">
              <Droplet className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Status da Troca de Óleo / Revisão</p>
                {oil.status === "ok" && <Badge tone="success">Em dia</Badge>}
                {oil.status === "near" && <Badge tone="warning">Próxima da troca</Badge>}
                {oil.status === "overdue" && <Badge tone="danger">Troca de óleo vencida!</Badge>}
                {oil.status === "unknown" && <Badge tone="neutral">Sem dados de revisão</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {oil.currentKm ? `Odômetro mais recente: ${formatNumber(oil.currentKm)} km` : "Odômetro não registrado"}
                {oil.nextKm ? ` · Próxima troca aos: ${formatNumber(oil.nextKm)} km` : ""}
                {oil.kmUntilNext != null
                  ? oil.kmUntilNext > 0
                    ? ` (faltam ${formatNumber(oil.kmUntilNext)} km)`
                    : ` (ultrapassou ${formatNumber(Math.abs(oil.kmUntilNext))} km!)`
                  : ""}
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={ROUTES.maintenance}>
              <Wrench className="size-3.5" /> Registrar revisão
            </Link>
          </Button>
        </div>

        {/* Abas de Detalhes do Veículo */}
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-2">
            {[
              { key: "locacoes" as const, label: `Locações (${info.rentals.length})`, icon: KeyRound },
              { key: "manutencao" as const, label: `Manutenções (${info.maintenances.length})`, icon: Wrench },
              { key: "vistorias" as const, label: `Vistorias (${info.inspections.length})`, icon: ClipboardCheck },
              { key: "multas" as const, label: `Multas (${info.fines.length})`, icon: TriangleAlert },
            ].map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? "primary" : "ghost"}
                className="h-8 text-xs font-semibold"
                onClick={() => setTab(t.key)}
              >
                <t.icon className="size-3.5" />
                {t.label}
              </Button>
            ))}
          </div>

          {/* Aba 1: Locações */}
          {tab === "locacoes" && (
            <div className="flex flex-col gap-2">
              {!info.rentals.length ? (
                <p className="py-8 text-center text-xs text-muted">Nenhuma locação registrada para este veículo no período.</p>
              ) : (
                info.rentals.map(({ rental: r, clientName, totalReceived, totalPending }) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`${ROUTES.rentals}/${r.id}`} className="font-semibold text-white hover:text-brand-soft hover:underline">
                          {clientName}
                        </Link>
                        <StatusBadge map={RENTAL_STATUS} value={r.status} />
                      </div>
                      <p className="mt-0.5 text-muted">
                        Período: {formatDate(r.startDate)} a {formatDate(r.endDate)} · Plano: {r.contractType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-300">Recebido: {formatCurrency(totalReceived)}</p>
                      {totalPending > 0 && <p className="text-amber-300">A receber: {formatCurrency(totalPending)}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Aba 2: Manutenções */}
          {tab === "manutencao" && (
            <div className="flex flex-col gap-2">
              {!info.maintenances.length ? (
                <p className="py-8 text-center text-xs text-muted">Nenhuma manutenção registrada para este veículo.</p>
              ) : (
                info.maintenances.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{m.description}</span>
                        <StatusBadge map={MAINTENANCE_STATUS} value={m.status} />
                      </div>
                      <p className="mt-0.5 text-muted">
                        Data: {formatDate(m.date)}
                        {m.currentKm ? ` · Km: ${formatNumber(m.currentKm)}` : ""}
                        {m.nextKm ? ` · Próxima troca: ${formatNumber(m.nextKm)} km` : ""}
                        {m.supplier ? ` · Fornecedor: ${m.supplier}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold text-red-300">
                      {m.amount ? formatCurrency(m.amount) : "—"}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Aba 3: Vistorias */}
          {tab === "vistorias" && (
            <div className="flex flex-col gap-3">
              {!info.inspections.length ? (
                <p className="py-8 text-center text-xs text-muted">Nenhuma vistoria arquivada para este veículo.</p>
              ) : (
                info.inspections.map((insp, idx) => (
                  <div key={idx} className="flex flex-col gap-2 rounded-xl border border-line bg-white/[0.02] p-3 text-xs">
                    {insp.delivery && (
                      <div>
                        <span className="font-semibold text-white">Vistoria de Retirada (Check-out)</span>
                        <p className="text-muted">
                          Data: {formatDate(insp.delivery.at.slice(0, 10))} · Km: {formatNumber(insp.delivery.km)} · Combustível: {FUEL_LABEL[insp.delivery.fuel]} · Responsável: {insp.delivery.staffName}
                        </p>
                      </div>
                    )}
                    {insp.return && (
                      <div className="mt-1 border-t border-line pt-1">
                        <span className="font-semibold text-white">Vistoria de Devolução (Check-in)</span>
                        <p className="text-muted">
                          Data: {formatDate(insp.return.at.slice(0, 10))} · Km: {formatNumber(insp.return.km)} · Combustível: {FUEL_LABEL[insp.return.fuel]} · Responsável: {insp.return.staffName}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Aba 4: Multas */}
          {tab === "multas" && (
            <div className="flex flex-col gap-2">
              {!info.fines.length ? (
                <p className="py-8 text-center text-xs text-muted">Nenhuma multa registrada para este veículo no período.</p>
              ) : (
                info.fines.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.02] p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">Auto {f.noticeNumber}</span>
                        <StatusBadge map={FINE_STATUS} value={f.status} />
                      </div>
                      <p className="mt-0.5 text-muted">
                        Infração: {formatDate(f.infractionDate)} · Vencimento: {formatDate(f.dueDate)} · {f.description}
                      </p>
                    </div>
                    <p className="font-semibold text-amber-300">
                      {formatCurrency(f.amount)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
