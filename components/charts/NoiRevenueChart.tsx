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

interface Punto {
  mes: string;
  ingresos: number;
  noi: number;
}

const COLOR_REV = "#8fd3cb";
const COLOR_NOI = "#0a5f59";

export default function NoiRevenueChart({ data }: { data: Punto[] }) {
  const chartData = data.map((p) => ({
    mes: mesCorto(p.mes),
    Ingresos: Math.round(p.ingresos),
    NOI: Math.round(p.noi),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={{ stroke: "#e4e7ec" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
          />
          <Tooltip
            formatter={(value) => eur(Number(value))}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e4e7ec",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Ingresos" fill={COLOR_REV} radius={[3, 3, 0, 0]} />
          <Line
            dataKey="NOI"
            stroke={COLOR_NOI}
            strokeWidth={2}
            dot={{ r: 2 }}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
