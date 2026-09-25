"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
  type PieSectorShapeProps,
  Sector,
} from "recharts";
import { CHART_COLORS } from "@/lib/constants";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

const axis = { stroke: CHART_COLORS.muted, fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: {
    background: "#0d0d0f",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  },
  labelStyle: { color: "#fff", fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
} as const;
const legend = { iconType: "circle" as const, iconSize: 8, wrapperStyle: { fontSize: 12, color: CHART_COLORS.muted } };
const chartStyle = { width: "100%", height: 280 };

const money = (v: unknown) => formatCurrency(Number(v));

export interface Series {
  key: string;
  name: string;
  color: string;
}

export function MoneyAreaChart<T extends object>({ data, xKey, series }: { data: T[]; xKey: string; series: Series[] }) {
  return (
    <AreaChart data={data} responsive style={chartStyle} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
      <XAxis dataKey={xKey} {...axis} />
      <YAxis {...axis} width={64} tickFormatter={(v: number) => formatCompactCurrency(v)} />
      <Tooltip {...tooltipStyle} formatter={money} />
      <Legend {...legend} />
      {series.map((s) => (
        <Area
          key={s.key}
          type="monotone"
          dataKey={s.key}
          name={s.name}
          stroke={s.color}
          strokeWidth={2}
          fill={`url(#grad-${s.key})`}
        />
      ))}
    </AreaChart>
  );
}

export function SimpleBarChart<T extends object>({
  data,
  xKey,
  series,
  currency,
  stacked,
}: {
  data: T[];
  xKey: string;
  series: Series[];
  currency?: boolean;
  stacked?: boolean;
}) {
  return (
    <BarChart data={data} responsive style={chartStyle} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
      <XAxis dataKey={xKey} {...axis} />
      <YAxis
        {...axis}
        width={currency ? 64 : 32}
        allowDecimals={false}
        tickFormatter={currency ? (v: number) => formatCompactCurrency(v) : undefined}
      />
      <Tooltip {...tooltipStyle} formatter={currency ? money : undefined} />
      {series.length > 1 && <Legend {...legend} />}
      {series.map((s) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.name}
          fill={s.color}
          radius={stacked ? 0 : [6, 6, 0, 0]}
          maxBarSize={36}
          stackId={stacked ? "s" : undefined}
        />
      ))}
    </BarChart>
  );
}

export interface Slice {
  name: string;
  value: number;
  color: string;
}

export function DonutChart({ data, currency, centerLabel }: { data: Slice[]; currency?: boolean; centerLabel?: string }) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const shape = (props: PieSectorShapeProps) => <Sector {...props} fill={data[props.index]?.color} />;
  return (
    <div className="relative">
      <PieChart responsive style={chartStyle}>
        <Tooltip {...tooltipStyle} formatter={currency ? money : undefined} />
        <Legend {...legend} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="#0d0d0f"
          strokeWidth={2}
          shape={shape}
        />
      </PieChart>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(50%-18px)] -translate-y-1/2 text-center">
        <p className="font-display text-lg font-semibold tabular-nums">{currency ? formatCompactCurrency(total) : total}</p>
        {centerLabel && <p className="text-[11px] uppercase tracking-wide text-zinc-500">{centerLabel}</p>}
      </div>
    </div>
  );
}
