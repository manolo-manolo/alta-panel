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
    return <p className="py-4 text-sm text-faint">Sin costes en el periodo.</p>;
  }
  const total = categorias.reduce((s, c) => s + c.total, 0);
  const conIngresos = ingresos !== undefined && ingresos > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-3 pb-1 text-xs font-medium uppercase tracking-wide text-faint">
        <span>Categoria</span>
        <span className="flex gap-4">
          <span className="w-20 text-right">Importe</span>
          <span className="w-14 text-right">% coste</span>
          {conIngresos && <span className="w-14 text-right">% ingr.</span>}
        </span>
      </div>
      {categorias.map((c) => (
        <details key={c.categoria} className="group rounded-md border border-line/70">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-surface-2">
            <span className="font-medium text-ink">
              <span className="mr-1.5 inline-block text-faint transition group-open:rotate-90">›</span>
              {CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}
            </span>
            <span className="flex gap-4">
              <span className="tabular w-20 text-right text-ink">{eur(c.total)}</span>
              <span className="tabular w-14 text-right text-muted">
                {total > 0 ? pct(c.total / total, 0) : "-"}
              </span>
              {conIngresos && (
                <span className="tabular w-14 text-right text-muted">
                  {pct(c.total / ingresos!, 0)}
                </span>
              )}
            </span>
          </summary>
          <div className="divide-y divide-line/50 border-t border-line/50">
            {c.conceptos.map((x, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 pl-8 text-sm">
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
        <span className="flex gap-4">
          <span className="tabular w-20 text-right">{eur(total)}</span>
          <span className="tabular w-14 text-right">100%</span>
          {conIngresos && (
            <span className="tabular w-14 text-right">{pct(total / ingresos!, 0)}</span>
          )}
        </span>
      </div>
    </div>
  );
}
