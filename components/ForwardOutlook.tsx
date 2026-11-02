import type { VentanaForward } from "@/lib/forward";
import { eur, num, pct, delta } from "@/lib/format";
import { DeltaBadge } from "@/components/ui";

// Tarjetas de vision futura (on the books) para 15/30/60/90 dias:
// ocupacion y ADR ya reservados, comparados con el mismo punto del ano
// pasado (STLY) y con el cierre real del ano pasado, mas la proyeccion.

function BarraOcupacion({ occ, cierreLY }: { occ: number | null; cierreLY: number | null }) {
  const w = Math.max(0, Math.min(1, occ ?? 0)) * 100;
  const m = cierreLY !== null ? Math.max(0, Math.min(1, cierreLY)) * 100 : null;
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-surface-3" aria-hidden>
      <div className="h-full rounded-full bg-brand" style={{ width: `${w}%` }} />
      {m !== null && (
        <div
          className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink/70"
          style={{ left: `calc(${m}% - 1px)` }}
          title="Cierre del año pasado"
        />
      )}
    </div>
  );
}

export default function ForwardOutlook({ ventanas }: { ventanas: VentanaForward[] }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ventanas.map((v) => (
          <div key={v.dias} className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Próximos {v.dias} días</span>
              <span className="tabular text-xs text-faint">
                {num(v.noches)}/{num(v.disponibles)} noches
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-medium text-muted">Ocupación</div>
                <div className="tabular mt-0.5 text-xl font-semibold tracking-tight text-ink">
                  {pct(v.occ)}
                </div>
                <div className="mt-1">
                  <DeltaBadge fraccion={delta(v.occ, v.occSTLY)} etiqueta="" />
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted">ADR</div>
                <div className="tabular mt-0.5 text-xl font-semibold tracking-tight text-ink">
                  {eur(v.adr)}
                </div>
                <div className="mt-1">
                  <DeltaBadge fraccion={delta(v.adr, v.adrSTLY)} etiqueta="" />
                </div>
              </div>
            </div>

            <BarraOcupacion occ={v.occ} cierreLY={v.occLY} />

            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">Revenue reservado</dt>
                <dd className="tabular font-semibold text-ink">{eur(v.revenue)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">RevPAR</dt>
                <dd className="tabular text-ink">{eur(v.revpar)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">Cierre año pasado</dt>
                <dd className="tabular text-ink">
                  {pct(v.occLY)} · {eur(v.adrLY)}
                </dd>
              </div>
              <div
                className="flex items-baseline justify-between gap-2"
                title="Reservado hoy más la recogida del año pasado desde este mismo punto, limitado al inventario disponible"
              >
                <dt className="text-muted">Proyección de cierre</dt>
                <dd className="tabular font-semibold text-ink">
                  {v.occProy !== null ? `~${pct(v.occProy)}` : "-"} · {eur(v.revenueProy)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-faint">
        Variaciones frente a lo que había reservado en el mismo punto del año pasado. La marca
        vertical de la barra indica dónde cerró esa ventana el año pasado.
      </p>
    </div>
  );
}
