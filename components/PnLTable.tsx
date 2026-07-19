import type { PnLMes } from "@/lib/metrics";
import { eur, mesCorto } from "@/lib/format";

/**
 * P&L mensual: lineas como filas, meses como columnas (con scroll horizontal
 * en movil) y una columna final de total TTM.
 */
export default function PnLTable({ serie }: { serie: PnLMes[] }) {
  const total = serie.reduce(
    (acc, m) => {
      acc.alojamiento += m.alojamiento;
      acc.limpieza += m.limpieza;
      acc.brutos += m.brutos;
      acc.comisiones += m.comisiones;
      acc.netos += m.netos;
      acc.costesVariables += m.costesVariables;
      acc.costesFijos += m.costesFijos;
      acc.noi += m.noi;
      return acc;
    },
    {
      alojamiento: 0, limpieza: 0, brutos: 0, comisiones: 0, netos: 0,
      costesVariables: 0, costesFijos: 0, noi: 0,
    },
  );

  const filas: {
    label: string;
    get: (m: PnLMes) => number;
    totalVal: number;
    fuerte?: boolean;
    negativo?: boolean;
  }[] = [
    { label: "Ingresos alojamiento", get: (m) => m.alojamiento, totalVal: total.alojamiento },
    { label: "Ingresos limpieza", get: (m) => m.limpieza, totalVal: total.limpieza },
    { label: "Ingresos brutos", get: (m) => m.brutos, totalVal: total.brutos, fuerte: true },
    { label: "Comisiones de canal", get: (m) => -m.comisiones, totalVal: -total.comisiones, negativo: true },
    { label: "Ingresos netos", get: (m) => m.netos, totalVal: total.netos, fuerte: true },
    { label: "Costes variables", get: (m) => -m.costesVariables, totalVal: -total.costesVariables, negativo: true },
    { label: "Costes fijos", get: (m) => -m.costesFijos, totalVal: -total.costesFijos, negativo: true },
    { label: "NOI", get: (m) => m.noi, totalVal: total.noi, fuerte: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium">
              Concepto
            </th>
            {serie.map((m) => (
              <th key={m.mes} className="px-2 py-2 text-right font-medium">
                <span className="capitalize">{mesCorto(m.mes)}</span>
                {m.costesPendientes && (
                  <span
                    className="ml-1 text-warn"
                    title="Costes pendientes en la hoja"
                  >
                    •
                  </span>
                )}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold text-ink">TTM</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.label}
              className={`border-b border-line/60 ${f.fuerte ? "font-semibold text-ink" : "text-muted"}`}
            >
              <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left">
                {f.label}
              </td>
              {serie.map((m) => {
                const v = f.get(m);
                return (
                  <td
                    key={m.mes}
                    className={`px-2 py-1.5 text-right ${f.negativo && v !== 0 ? "text-bad" : ""}`}
                  >
                    {v === 0 ? "-" : eur(v)}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right font-semibold text-ink">
                {eur(f.totalVal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
