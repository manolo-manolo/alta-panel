import { ChevronRight } from "lucide-react";
import type { CategoriaCoste } from "@/lib/metrics";
import { eur, pct } from "@/lib/format";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

/**
 * Desglose ejecutivo de opex por categoria: importe, % del coste total y
 * % sobre ingresos (si se pasan). Cada categoria se expande a sus conceptos.
 */
export default function OpexDetalle({
  categorias,
  ingresos,
}: {
  categorias: CategoriaCoste[];
  ingresos?: number;
}) {
  if (categorias.length === 0) {
    return <p className="py-4 text-sm text-muted">Sin costes en el periodo.</p>;
  }
  const total = categorias.reduce((s, c) => s + c.total, 0);
  const conIngresos = ingresos !== undefined && ingresos > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-3 pb-1.5 text-xs font-medium text-muted">
        <span>Categoría</span>
        <span className="flex shrink-0 gap-2 sm:gap-4">
          <span className="w-[4.5rem] text-right sm:w-20">Importe</span>
          <span className="w-11 text-right sm:w-14">% coste</span>
          {conIngresos && <span className="w-11 text-right sm:w-14">% ingr.</span>}
        </span>
      </div>
      {categorias.map((c) => (
        <details key={c.categoria} className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-surface-2">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
              <ChevronRight size={14} className="shrink-0 text-faint transition group-open:rotate-90" aria-hidden />
              {CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}
            </span>
            <span className="flex shrink-0 gap-2 sm:gap-4">
              <span className="tabular w-[4.5rem] text-right sm:w-20 text-ink">{eur(c.total)}</span>
              <span className="tabular w-11 text-right sm:w-14 text-muted">
                {total > 0 ? pct(c.total / total, 0) : "-"}
              </span>
              {conIngresos && (
                <span className="tabular w-11 text-right sm:w-14 text-muted">
                  {pct(c.total / ingresos!, 0)}
                </span>
              )}
            </span>
          </summary>
          <div className="divide-y divide-line border-t border-line">
            {c.conceptos.map((x, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 pl-8 text-sm">
                <span className="text-muted">
                  {x.concepto}
                  {x.estimado && <span className="ml-1 text-xs text-brand">(est.)</span>}
                </span>
                <span className="tabular text-muted">{eur(x.importe)}</span>
              </div>
            ))}
          </div>
        </details>
      ))}
      <div className="mt-1 flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-ink">
        <span>Total costes</span>
        <span className="flex shrink-0 gap-2 sm:gap-4">
          <span className="tabular w-[4.5rem] text-right sm:w-20">{eur(total)}</span>
          <span className="tabular w-11 text-right sm:w-14">100%</span>
          {conIngresos && (
            <span className="tabular w-11 text-right sm:w-14">{pct(total / ingresos!, 0)}</span>
          )}
        </span>
      </div>
    </div>
  );
}
