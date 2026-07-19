import { eur, pct } from "@/lib/format";

/**
 * Impacto neto de la limpieza: ingresos de limpieza menos coste de limpieza y
 * menos la comision de OTA atribuible a esos ingresos. Version compacta.
 */
export default function CleaningImpact({
  ingresos,
  costes,
  comision,
}: {
  ingresos: number;
  costes: number;
  comision: number;
}) {
  const neto = ingresos - costes - comision;
  const margen = ingresos > 0 ? neto / ingresos : null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Impacto neto limpieza</span>
        <span className={`tabular text-xl font-semibold ${neto >= 0 ? "text-ok" : "text-bad"}`}>
          {eur(neto)} {margen !== null && <span className="text-sm">({pct(margen)})</span>}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-faint">
        <span>Ingresos {eur(ingresos)}</span>
        <span>· Costes {eur(costes)}</span>
        <span>· Comision OTA {eur(comision)}</span>
      </div>
    </div>
  );
}
