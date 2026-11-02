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

function Total({
  label,
  valor,
  actual,
  previo,
}: {
  label: string;
  valor: string;
  actual: number | null;
  previo: number | null;
}) {
  const v = actual !== null && previo !== null && previo !== 0 ? (actual - previo) / Math.abs(previo) : null;
  return (
    <div>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="tabular text-lg font-semibold tracking-tight text-ink">{valor}</span>
        {v !== null && (
          <span className={`tabular text-xs font-medium ${v >= 0 ? "text-ok" : "text-bad"}`}>
            {v >= 0 ? "+" : "-"}{pct(Math.abs(v))} vs 12 meses ant.
          </span>
        )}
      </div>
    </div>
  );
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
    "Ocupación": p.occ !== null ? Math.round(p.occ * 1000) / 10 : null,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {metric === "inoi" && (
            <>
              <Total label="Ingresos 12 meses" valor={eur(ttm.ingresos)} actual={ttm.ingresos} previo={ttmPrev.ingresos} />
              <Total label="NOI 12 meses" valor={eur(ttm.noi)} actual={ttm.noi} previo={ttmPrev.noi} />
            </>
          )}
          {metric === "adr" && (
            <Total label="ADR 12 meses" valor={eur(ttm.adr)} actual={ttm.adr} previo={ttmPrev.adr} />
          )}
          {metric === "occ" && (
            <Total label="Ocupación 12 meses" valor={pct(ttm.occ)} actual={ttm.occ} previo={ttmPrev.occ} />
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Métrica">
          {([
            ["inoi", "Ingresos y NOI"],
            ["adr", "ADR"],
            ["occ", "Ocupación"],
          ] as [Metric, string][]).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMetric(v)}
              aria-pressed={metric === v}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                metric === v ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#edf0ee" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#667472" }} tickLine={false} axisLine={{ stroke: "#e4e8e6" }} />
            {metric === "inoi" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#667472" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip formatter={(value) => eur(Number(value))} contentStyle={{ borderRadius: 10, border: "1px solid #e4e8e6", fontSize: 12, boxShadow: "0 10px 28px -8px rgb(15 29 28 / 0.2)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#4d5b59" }}>{v}</span>} />
                <Bar dataKey="Ingresos" fill={COLOR_REV} radius={[3, 3, 0, 0]} />
                <Line dataKey="NOI" stroke={COLOR_NOI} strokeWidth={2} dot={{ r: 2 }} type="monotone" />
              </>
            )}
            {metric === "adr" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#667472" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v} €`} />
                <Tooltip formatter={(value) => eur(Number(value))} contentStyle={{ borderRadius: 10, border: "1px solid #e4e8e6", fontSize: 12, boxShadow: "0 10px 28px -8px rgb(15 29 28 / 0.2)" }} />
                <Line dataKey="ADR" stroke={COLOR_LINE} strokeWidth={2} dot={{ r: 2 }} type="monotone" connectNulls />
              </>
            )}
            {metric === "occ" && (
              <>
                <YAxis tick={{ fontSize: 11, fill: "#667472" }} tickLine={false} axisLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => `${value}%`} contentStyle={{ borderRadius: 10, border: "1px solid #e4e8e6", fontSize: 12, boxShadow: "0 10px 28px -8px rgb(15 29 28 / 0.2)" }} />
                <Line dataKey="Ocupación" stroke={COLOR_LINE} strokeWidth={2} dot={{ r: 2 }} type="monotone" connectNulls />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
