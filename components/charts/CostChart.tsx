"use client";

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
import { mesCorto, eur } from "@/lib/format";

// Evolucion mensual de costes: fijos y variables apilados, con el peso del
// opex sobre los ingresos netos como linea (eje derecho).

export interface PuntoCoste {
  mes: string;
  fijos: number;
  variables: number;
  ratio: number | null; // opex / ingresos netos (fraccion)
}

const COLOR_FIJOS = "#0a5f59";
const COLOR_VARIABLES = "#8fd3cb";
const COLOR_RATIO = "#d97706";

export default function CostChart({ data }: { data: PuntoCoste[] }) {
  const chartData = data.map((p) => ({
    mes: mesCorto(p.mes),
    Fijos: Math.round(p.fijos),
    Variables: Math.round(p.variables),
    "% de ingresos": p.ratio !== null ? Math.round(p.ratio * 1000) / 10 : null,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#edf0ee" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: "#667472" }}
            tickLine={false}
            axisLine={{ stroke: "#e4e8e6" }}
          />
          <YAxis
            yAxisId="eur"
            tick={{ fontSize: 11, fill: "#667472" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            tick={{ fontSize: 11, fill: "#d97706" }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value, name) =>
              name === "% de ingresos" ? `${value}%` : eur(Number(value))
            }
            contentStyle={{ borderRadius: 10, border: "1px solid #e4e8e6", fontSize: 12, boxShadow: "0 10px 28px -8px rgb(15 29 28 / 0.2)" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "#4d5b59" }}>{v}</span>} />
          <Bar yAxisId="eur" dataKey="Variables" stackId="opex" fill={COLOR_VARIABLES} radius={[0, 0, 0, 0]} />
          <Bar yAxisId="eur" dataKey="Fijos" stackId="opex" fill={COLOR_FIJOS} radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="pct"
            dataKey="% de ingresos"
            stroke={COLOR_RATIO}
            strokeWidth={2}
            dot={{ r: 2 }}
            type="monotone"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
