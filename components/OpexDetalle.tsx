import type { CategoriaCoste } from "@/lib/metrics";
import { eur } from "@/lib/format";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

/** Desglose de opex por categoria, con concepto expandible. */
export default function OpexDetalle({ categorias }: { categorias: CategoriaCoste[] }) {
  if (categorias.length === 0) {
    return <p className="py-4 text-sm text-faint">Sin costes en el periodo.</p>;
  }
  const total = categorias.reduce((s, c) => s + c.total, 0);
  return (
    <div className="flex flex-col gap-1">
      {categorias.map((c) => (
        <details key={c.categoria} className="rounded-md border border-line/70">
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
            <span className="font-medium text-ink">
              {CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}
            </span>
            <span className="tabular text-ink">{eur(c.total)}</span>
          </summary>
          <div className="divide-y divide-line/50 border-t border-line/50">
            {c.conceptos.map((x, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
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
      <div className="mt-1 flex items-center justify-between px-3 py-1 text-sm font-semibold text-ink">
        <span>Total costes</span>
        <span className="tabular">{eur(total)}</span>
      </div>
    </div>
  );
}
