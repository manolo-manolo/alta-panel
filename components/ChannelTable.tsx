import type { MixCanal } from "@/lib/metrics";
import { eur, num, pct } from "@/lib/format";
import { CANAL_LABEL, type Canal } from "@/lib/config";

const COLOR: Record<Canal, string> = {
  airbnb: "#e0675a",
  booking: "#2f5d9b",
  directo: "#0d7c74",
  otros: "#9aa5a3",
};

export default function ChannelTable({ data }: { data: MixCanal[] }) {
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalN = data.reduce((s, d) => s + d.noches, 0);
  if (totalRev === 0 && totalN === 0) {
    return <p className="py-6 text-center text-sm text-muted">Sin ingresos en el periodo</p>;
  }
  return (
    <div>
      {totalRev > 0 && (
        <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {data
            .filter((d) => d.revenue > 0)
            .map((d) => (
              <div
                key={d.canal}
                style={{ width: `${(d.revenue / totalRev) * 100}%`, backgroundColor: COLOR[d.canal] }}
              />
            ))}
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th className="px-2.5 py-2 text-left">Canal</th>
            <th className="px-2.5 py-2 text-right">Revenue</th>
            <th className="px-2.5 py-2 text-right">%</th>
            <th className="px-2.5 py-2 text-right">Noches</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.canal}>
              <td className="px-2.5 py-2 text-left whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLOR[d.canal] }}
                  />
                  {CANAL_LABEL[d.canal]}
                </span>
              </td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{eur(d.revenue)}</td>
              <td className="px-2.5 py-2 text-right text-muted">
                {totalRev > 0 ? pct(d.revenue / totalRev, 0) : "-"}
              </td>
              <td className="px-2.5 py-2 text-right text-muted">
                {num(d.noches)}
                <span className="ml-1 text-xs text-faint">
                  {totalN > 0 ? pct(d.noches / totalN, 0) : ""}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-2.5 py-2 text-left">Total</td>
            <td className="px-2.5 py-2 text-right whitespace-nowrap">{eur(totalRev)}</td>
            <td className="px-2.5 py-2 text-right">100%</td>
            <td className="px-2.5 py-2 text-right">{num(totalN)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
