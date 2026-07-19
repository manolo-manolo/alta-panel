import type { CosteDetalle } from "@/lib/metrics";
import { eur } from "@/lib/format";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

export default function CostBreakdown({ costes }: { costes: CosteDetalle[] }) {
  if (costes.length === 0) {
    return (
      <p className="py-4 text-sm text-warn">
        Sin costes cargados este mes (costes pendientes).
      </p>
    );
  }
  const total = costes.reduce((s, c) => s + c.importe, 0);
  return (
    <table className="tabular w-full border-collapse text-sm">
      <tbody>
        {costes.map((c, i) => (
          <tr key={i} className="border-b border-line/60">
            <td className="px-2 py-1.5 text-left text-muted">
              {CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria}
            </td>
            <td className="px-2 py-1.5 text-left text-ink">
              {c.concepto ?? "-"}
              {c.estimado && (
                <span className="ml-1 text-xs text-brand" title="Estimado por run-rate">
                  (est.)
                </span>
              )}
            </td>
            <td className="px-2 py-1.5 text-right text-ink">{eur(c.importe)}</td>
          </tr>
        ))}
        <tr className="font-semibold text-ink">
          <td className="px-2 py-1.5 text-left" colSpan={2}>
            Total
          </td>
          <td className="px-2 py-1.5 text-right">{eur(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
