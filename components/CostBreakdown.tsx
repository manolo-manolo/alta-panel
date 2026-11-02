import type { CosteDetalle } from "@/lib/metrics";
import { eur } from "@/lib/format";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

export default function CostBreakdown({ costes }: { costes: CosteDetalle[] }) {
  if (costes.length === 0) {
    return (
      <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-sm text-warn">
        Sin costes cargados este mes (costes pendientes).
      </p>
    );
  }
  const total = costes.reduce((s, c) => s + c.importe, 0);
  return (
    <table className="data-table">
      <tbody>
        {costes.map((c, i) => (
          <tr key={i}>
            <td className="px-2.5 py-2 text-left text-muted">
              {CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}
            </td>
            <td className="px-2.5 py-2 text-left">
              {c.concepto ?? "-"}
              {c.estimado && (
                <span className="ml-1 text-xs text-brand" title="Estimado por run-rate">
                  (est.)
                </span>
              )}
            </td>
            <td className="px-2.5 py-2 text-right whitespace-nowrap">{eur(c.importe)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="px-2.5 py-2 text-left" colSpan={2}>
            Total
          </td>
          <td className="px-2.5 py-2 text-right whitespace-nowrap">{eur(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
