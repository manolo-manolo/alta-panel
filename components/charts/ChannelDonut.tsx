"use client";

import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { eur, num, pct } from "@/lib/format";
import { CANAL_LABEL, type Canal } from "@/lib/config";

interface Mix {
  canal: Canal;
  revenue: number;
  noches: number;
}

const COLORES: Record<Canal, string> = {
  airbnb: "#e07a5f",
  booking: "#3d5a80",
  directo: "#0d7c74",
  otros: "#94a3b8",
};

export default function ChannelDonut({ data }: { data: Mix[] }) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const conDatos = data.filter((d) => d.revenue > 0 || d.noches > 0);

  if (conDatos.length === 0) {
    return <p className="py-8 text-center text-sm text-faint">Sin ingresos este mes</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={conDatos}
              dataKey="revenue"
              nameKey="canal"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {conDatos.map((d) => (
                <Cell key={d.canal} fill={COLORES[d.canal]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full space-y-1.5">
        {data.map((d) => (
          <div key={d.canal} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORES[d.canal] }}
            />
            <span className="w-16 text-ink">{CANAL_LABEL[d.canal]}</span>
            <span className="tabular ml-auto text-ink">{eur(d.revenue)}</span>
            <span className="tabular w-12 text-right text-faint">
              {total > 0 ? pct(d.revenue / total, 0) : "-"}
            </span>
            <span className="tabular w-16 text-right text-muted">
              {num(d.noches)} n
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
