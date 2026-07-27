import type { VentanaForward } from "@/lib/forward";
import { eur, num, pct, delta } from "@/lib/format";
import { DeltaBadge } from "@/components/ui";

// Tarjetas de vision futura (on the books) para 15/30/60/90 dias:
// ocupacion y ADR ya reservados, comparados con el mismo punto del ano
// pasado (STLY) y con el cierre real del ano pasado, mas la proyeccion.

export default function ForwardOutlook({ ventanas }: { ventanas: VentanaForward[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {ventanas.map((v) => (
        <div key={v.dias} className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-faint">
              Proximos {v.dias} dias
            </span>
            <span className="text-[11px] text-faint">
              {num(v.noches)}/{num(v.disponibles)} noches
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-faint">Ocupacion</div>
              <div className="tabular text-xl font-semibold text-ink">{pct(v.occ)}</div>
              <DeltaBadge fraccion={delta(v.occ, v.occSTLY)} etiqueta="vs ritmo LY" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-faint">ADR</div>
              <div className="tabular text-xl font-semibold text-ink">{eur(v.adr)}</div>
              <DeltaBadge fraccion={delta(v.adr, v.adrSTLY)} etiqueta="vs ritmo LY" />
            </div>
          </div>

          <div className="mt-2 flex items-baseline justify-between text-sm">
            <span className="text-muted">Revenue OTB</span>
            <span className="tabular font-medium text-ink">{eur(v.revenue)}</span>
          </div>
          <div className="flex items-baseline justify-between text-xs text-muted">
            <span>RevPAR</span>
            <span className="tabular">{eur(v.revpar)}</span>
          </div>

          <div className="mt-2 border-t border-line pt-2 text-xs text-muted">
            <div className="flex items-baseline justify-between">
              <span>Cierre ano pasado</span>
              <span className="tabular">
                {pct(v.occLY)} · {eur(v.adrLY)}
              </span>
            </div>
            <div
              className="flex items-baseline justify-between"
              title="OTB actual mas la recogida (pickup) del ano pasado desde este mismo punto, capada al inventario disponible"
            >
              <span>Proyeccion de cierre</span>
              <span className="tabular font-medium text-ink">
                {v.occProy !== null ? `~${pct(v.occProy)}` : "-"} · {eur(v.revenueProy)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
