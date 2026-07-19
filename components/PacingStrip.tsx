import type { PacingVentana } from "@/lib/metrics";
import { eur, num } from "@/lib/format";
import { DeltaBadge } from "@/components/ui";

function deltaFrac(actual: number, ly: number): number | null {
  if (ly === 0) return null;
  return (actual - ly) / Math.abs(ly);
}

export default function PacingStrip({ pacing }: { pacing: PacingVentana[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {pacing.map((p) => (
        <div key={p.dias} className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            Proximos {p.dias} dias
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular text-xl font-semibold text-ink">
              {num(p.noches)}
            </span>
            <span className="text-xs text-muted">noches</span>
          </div>
          <div className="tabular text-sm text-muted">{eur(p.revenue)}</div>
          <div className="mt-1">
            <DeltaBadge
              fraccion={deltaFrac(p.noches, p.nochesLY)}
              etiqueta="noches vs ano ant."
            />
          </div>
        </div>
      ))}
    </div>
  );
}
