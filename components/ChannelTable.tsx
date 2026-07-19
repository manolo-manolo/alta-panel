import type { MixCanal } from "@/lib/metrics";
import { eur, num, pct } from "@/lib/format";
import { CANAL_LABEL, type Canal } from "@/lib/config";

const COLOR: Record<Canal, string> = {
  airbnb: "#e07a5f",
  booking: "#3d5a80",
  directo: "#0d7c74",
  otros: "#94a3b8",
};

export default function ChannelTable({ data }: { data: MixCanal[] }) {
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalN = data.reduce((s, d) => s + d.noches, 0);
  if (totalRev === 0 && totalN === 0) {
    return <p className="py-6 text-center text-sm text-faint">Sin ingresos en el periodo</p>;
  }
  return (
    <table className="tabular w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line text-xs text-faint">
          <th className="px-2 py-2 text-left font-medium">Canal</th>
          <th className="px-2 py-2 text-right font-medium">Revenue</th>
          <th className="px-2 py-2 text-right font-medium">% rev</th>
          <th className="px-2 py-2 text-right font-medium">Noches</th>
          <th className="px-2 py-2 text-right font-medium">% noches</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.canal} className="border-b border-line/60">
            <td className="px-2 py-1.5 text-left">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: COLOR[d.canal] }} />
              {CANAL_LABEL[d.canal]}
            </td>
            <td className="px-2 py-1.5 text-right text-ink">{eur(d.revenue)}</td>
            <td className="px-2 py-1.5 text-right text-muted">{totalRev > 0 ? pct(d.revenue / totalRev, 0) : "-"}</td>
            <td className="px-2 py-1.5 text-right text-ink">{num(d.noches)}</td>
            <td className="px-2 py-1.5 text-right text-muted">{totalN > 0 ? pct(d.noches / totalN, 0) : "-"}</td>
          </tr>
        ))}
        <tr className="font-semibold text-ink">
          <td className="px-2 py-1.5 text-left">Total</td>
          <td className="px-2 py-1.5 text-right">{eur(totalRev)}</td>
          <td className="px-2 py-1.5 text-right">100%</td>
          <td className="px-2 py-1.5 text-right">{num(totalN)}</td>
          <td className="px-2 py-1.5 text-right">100%</td>
        </tr>
      </tbody>
    </table>
  );
}
