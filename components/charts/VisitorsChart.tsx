"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { num } from "@/lib/format";

// Serie temporal diaria de dos metricas (p. ej. visitantes y vistas, o
// clicks e impresiones). Con `ejeSecundario` la segunda serie usa su propio
// eje derecho (para magnitudes muy distintas, como impresiones vs clicks).

export interface PuntoSerie {
  fecha: string; // YYYY-MM-DD
  a: number;
  b: number;
}

const COLOR_A = "#0a5f59";
const COLOR_B = "#8fd3cb";

function tick(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export default function VisitorsChart({
  data,
  labelA,
  labelB,
  ejeSecundario = false,
}: {
  data: PuntoSerie[];
  labelA: string;
  labelB: string;
  ejeSecundario?: boolean;
}) {
  const chartData = data.map((p) => ({
    fecha: tick(p.fecha),
    [labelA]: p.a,
    [labelB]: p.b,
  }));

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#edf0ee" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 11, fill: "#667472" }}
            tickLine={false}
            axisLine={{ stroke: "#e4e8e6" }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="a"
            tick={{ fontSize: 11, fill: "#667472" }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          {ejeSecundario && (
            <YAxis
              yAxisId="b"
              orientation="right"
              tick={{ fontSize: 11, fill: "#667472" }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
          )}
          <Tooltip
            formatter={(value) => num(Number(value))}
            contentStyle={{ borderRadius: 10, border: "1px solid #e4e8e6", fontSize: 12, boxShadow: "0 10px 28px -8px rgb(15 29 28 / 0.2)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#4d5b59" }}>{v}</span>} />
          <Area
            yAxisId={ejeSecundario ? "b" : "a"}
            dataKey={labelB}
            stroke={COLOR_B}
            fill={COLOR_B}
            fillOpacity={0.25}
            strokeWidth={1.5}
            type="monotone"
          />
          <Line
            yAxisId="a"
            dataKey={labelA}
            stroke={COLOR_A}
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
