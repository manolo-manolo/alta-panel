"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { mesCorto, eur, pct } from "@/lib/format";

export interface PuntoChart {
  mes: string;
  ingresos: number;
  noi: number;
  adr: number | null;
  occ: number | null;
}
export interface TotalesChart {
  ingresos: number;
  noi: number;
  adr: number | null;
  occ: number | null;
}

type Metric = "inoi" | "adr" | "occ";

const COLOR_REV = "#8fd3cb";
const COLOR_NOI = "#0a5f59";
const COLOR_LINE = "#0a5f59";

function variacion(actual: number | null, prev: number | null): string {
  if (actual === null || prev === null || prev === 0) return "n/d";
  const v = (actual - prev) / Math.abs(prev);
  const s = v >= 0 ? "+" : "";
  return `${s}${pct(v)}`;
}

export default function MetricChart({
  data,
  ttm,
  ttmPrev,
}: {
  data: PuntoChart[];
  ttm: TotalesChart;
  ttmPrev: TotalesChart;
}) {
  const [metric, setMetric] = useState<Metric>("inoi");

  const chartData = data.map((p) => ({
    mes: mesCorto(p.mes),
    Ingresos: Math.round(p.ingresos),
    NOI: Math.round(p.noi),
    ADR: p.adr !== null ? Math.round(p.adr) : null,
    Ocupacion: p.occ !== null ? Math.round(p.occ * 1000) / 10 : null,
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {metric === "inoi" && (
            <>
              <span>Ingresos TTM <b className="text-ink">{eur(ttm.ingresos)}</b> <span className="text-faint">({variacion(ttm.ingresos, ttmPrev.ingresos)})</span></span>
              <span>NOI TTM <b className="text-ink">{eur(ttm.noi)}</b> <span className="text-faint">({variacion(ttm.noi, ttmPrev.noi)})</span></span>
            </>
          )}
          {metric === "adr" && (
            <span>ADR TTM <b className="text-ink">{eur(ttm.adr)}</b> <span className="text-faint">({variacion(ttm.adr, ttmPrev.adr)})</span></span>
          )}
          {metric === "occ" && (
            <span>Ocupacion TTM <b className="text-ink">{pct(ttm.occ)}</b> <span className="text-faint">({variacion(ttm.occ, ttmPrev.occ)})</span></span>
          )}
        </div>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand"
        >
          <option value="inoi">Ingresos y NOI</option>
          <option value="adr">ADR</option>
          <option value="occ">Ocupacion</option>
        </select>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e4e7ec" }} />
            {metric === "inoi" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(value) => eur(Number(value))} contentStyle={{ borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill={COLOR_REV} radius={[3, 3, 0, 0]} />
                <Line dataKey="NOI" stroke={COLOR_NOI} strokeWidth={2} dot={{ r: 2 }} type="monotone" />
              </>
            )}
            {metric === "adr" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v} €`} />
                <Tooltip formatter={(value) => eur(Number(value))} contentStyle={{ borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12 }} />
                <Line dataKey="ADR" stroke={COLOR_LINE} strokeWidth={2} dot={{ r: 2 }} type="monotone" connectNulls />
              </>
            )}
            {metric === "occ" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => `${value}%`} contentStyle={{ borderRadius: 8, border: "1px solid #e4e7ec", fontSize: 12 }} />
                <Line dataKey="Ocupacion" stroke={COLOR_LINE} strokeWidth={2} dot={{ r: 2 }} type="monotone" connectNulls />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
