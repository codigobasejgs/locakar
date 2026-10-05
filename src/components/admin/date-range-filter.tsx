"use client";

import { Calendar, CalendarRange, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { presetDateRange, type DatePresetKey, type DateRange } from "@/lib/analytics";
import { formatDate } from "@/lib/utils";

interface DateRangeFilterProps {
  range: DateRange;
  today: string;
  onChange: (range: DateRange) => void;
}

const PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "this_week", label: "Esta semana" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
  { key: "last_3_months", label: "3 meses" },
  { key: "last_6_months", label: "6 meses" },
  { key: "this_year", label: "Este ano" },
  { key: "all", label: "Tudo" },
  { key: "custom", label: "Personalizado" },
];

export function DateRangeFilter({ range, today, onChange }: DateRangeFilterProps) {
  const [showCustom, setShowCustom] = useState(range.key === "custom");
  const [customFrom, setCustomFrom] = useState(range.from || today);
  const [customTo, setCustomTo] = useState(range.to || today);

  const selectPreset = (key: DatePresetKey) => {
    if (key === "custom") {
      setShowCustom(true);
      onChange(presetDateRange("custom", today, customFrom, customTo));
    } else {
      setShowCustom(false);
      onChange(presetDateRange(key, today));
    }
  };

  const applyCustom = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    onChange(presetDateRange("custom", today, from, to));
  };

  return (
    <Card data-tour="dashboard-period" className="mb-6 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Presets rápidos */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
            <CalendarRange className="size-3.5" /> Período:
          </span>
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={range.key === p.key ? "primary" : "outline"}
              className="h-8 text-xs font-medium"
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* Indicador do período ativo */}
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span>
            {range.from && range.to ? (
              range.from === range.to ? (
                <>Data: <strong className="text-white">{formatDate(range.from)}</strong></>
              ) : (
                <>De <strong className="text-white">{formatDate(range.from)}</strong> até <strong className="text-white">{formatDate(range.to)}</strong></>
              )
            ) : (
              <strong className="text-white">Todo o histórico</strong>
            )}
          </span>
          {range.key !== "last_6_months" && (
            <button
              onClick={() => selectPreset("last_6_months")}
              title="Restaurar padrão (6 meses)"
              className="rounded p-1 text-muted hover:text-white"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Inputs de data entre datas para período personalizado */}
      {showCustom && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="filter-from" className="text-xs font-medium text-muted">Data inicial:</label>
            <Input
              id="filter-from"
              type="date"
              value={customFrom}
              onChange={(e) => applyCustom(e.target.value, customTo)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="filter-to" className="text-xs font-medium text-muted">Data final:</label>
            <Input
              id="filter-to"
              type="date"
              value={customTo}
              onChange={(e) => applyCustom(customFrom, e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <span className="text-xs text-muted">
            <Calendar className="mr-1 inline size-3" />
            Escolha qualquer intervalo entre datas
          </span>
        </div>
      )}
    </Card>
  );
}
