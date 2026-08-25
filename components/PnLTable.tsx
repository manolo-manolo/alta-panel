import type { PnLMes } from "@/lib/metrics";
import type { CashExtras } from "@/lib/finance";
import { FINANCIACION } from "@/lib/config";
import { eur, mesCorto, pct } from "@/lib/format";

type PnLFila = PnLMes & Partial<CashExtras>;

/**
 * P&L mensual: lineas como filas, meses como columnas (con scroll horizontal
 * en movil) y una columna final de total TTM. Si la serie trae las lineas de
 * caja (overhead, intereses, principal), el P&L baja hasta caja neta y DSCR.
 */
export default function PnLTable({ serie }: { serie: PnLFila[] }) {
  const esCash = serie.length > 0 && serie[0].caja !== undefined;
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
      acc.overhead += m.overhead ?? 0;
      acc.intereses += m.intereses ?? 0;
      acc.principal += m.principal ?? 0;
      acc.caja += m.caja ?? 0;
      return acc;
    },
    {
      alojamiento: 0, limpieza: 0, brutos: 0, comisiones: 0, netos: 0,
      costesVariables: 0, costesFijos: 0, noi: 0,
      overhead: 0, intereses: 0, principal: 0, caja: 0,
    },
  );

  const filas: {
    label: string;
    get: (m: PnLFila) => number;
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
    ...(esCash
      ? [
          { label: "Overhead corporativo", get: (m: PnLFila) => -(m.overhead ?? 0), totalVal: -total.overhead, negativo: true },
          { label: "Intereses deuda", get: (m: PnLFila) => -(m.intereses ?? 0), totalVal: -total.intereses, negativo: true },
          { label: "Amortizacion principal", get: (m: PnLFila) => -(m.principal ?? 0), totalVal: -total.principal, negativo: true },
          { label: "Caja neta", get: (m: PnLFila) => m.caja ?? 0, totalVal: total.caja, fuerte: true },
        ]
      : []),
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
                {m.costesEstimados && (
                  <span
                    className="ml-1 text-brand"
                    title="Costes estimados (run-rate)"
                  >
                    ~
                  </span>
                )}
                {m.costesPendientes && (
                  <span
                    className="ml-1 text-warn"
                    title="Costes pendientes"
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
          <tr className="border-t border-line/60 text-muted">
            <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left">
              Margen NOI (NOI / ingresos)
            </td>
            {serie.map((m) => (
              <td key={m.mes} className="px-2 py-1.5 text-right">
                {m.brutos > 0 ? pct(m.noi / m.brutos) : "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-semibold text-ink">
              {total.brutos > 0 ? pct(total.noi / total.brutos) : "-"}
            </td>
          </tr>
          {esCash && (
            <>
              <tr className="border-t border-line/60 text-muted">
                <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left">
                  DSCR (NOI / servicio de deuda)
                </td>
                {serie.map((m) => {
                  const servicio = (m.intereses ?? 0) + (m.principal ?? 0);
                  return (
                    <td key={m.mes} className="px-2 py-1.5 text-right">
                      {servicio > 0 ? `${(m.noi / servicio).toFixed(2)}x` : "-"}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-semibold text-ink">
                  {total.intereses + total.principal > 0
                    ? `${(total.noi / (total.intereses + total.principal)).toFixed(2)}x`
                    : "-"}
                </td>
              </tr>
              <tr className="border-t border-line/60 text-muted">
                <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left">
                  Margen de caja (caja / ingresos)
                </td>
                {serie.map((m) => (
                  <td key={m.mes} className="px-2 py-1.5 text-right">
                    {m.brutos > 0 ? pct((m.caja ?? 0) / m.brutos) : "-"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold text-ink">
                  {total.brutos > 0 ? pct(total.caja / total.brutos) : "-"}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-faint">
        <span className="text-brand">~</span> costes estimados por run-rate ·{" "}
        <span className="text-warn">•</span> costes pendientes
        {esCash && (
          <>
            {" "}· supuestos de caja: deuda del {Math.round(FINANCIACION.ltv * 100)}% del coste de
            adquisicion (solo unidades en propiedad), amortizacion lineal a{" "}
            {FINANCIACION.anosAmortizacion} anos, interes del{" "}
            {(FINANCIACION.interesAnual * 100).toFixed(1).replace(".", ",")}% sobre saldo vivo, y
            overhead corporativo de {Math.round(FINANCIACION.overheadAnualEur / 1000)}k EUR/ano
            repartido por cuota de ingresos netos. Las master lease no llevan deuda: su
            &quot;financiacion&quot; es la renta, ya incluida en costes fijos.
          </>
        )}
      </p>
    </div>
  );
}
