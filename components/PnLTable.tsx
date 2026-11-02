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

  type Tipo = "linea" | "subtotal" | "resultado";
  const filas: {
    label: string;
    get: (m: PnLFila) => number;
    totalVal: number;
    tipo: Tipo;
  }[] = [
    { label: "Alojamiento", get: (m) => m.alojamiento, totalVal: total.alojamiento, tipo: "linea" },
    { label: "Limpieza", get: (m) => m.limpieza, totalVal: total.limpieza, tipo: "linea" },
    { label: "Ingresos brutos", get: (m) => m.brutos, totalVal: total.brutos, tipo: "subtotal" },
    { label: "Comisiones de canal", get: (m) => -m.comisiones, totalVal: -total.comisiones, tipo: "linea" },
    { label: "Ingresos netos", get: (m) => m.netos, totalVal: total.netos, tipo: "subtotal" },
    { label: "Costes variables", get: (m) => -m.costesVariables, totalVal: -total.costesVariables, tipo: "linea" },
    { label: "Costes fijos", get: (m) => -m.costesFijos, totalVal: -total.costesFijos, tipo: "linea" },
    { label: "NOI", get: (m) => m.noi, totalVal: total.noi, tipo: "resultado" },
    ...(esCash
      ? ([
          { label: "Overhead corporativo", get: (m: PnLFila) => -(m.overhead ?? 0), totalVal: -total.overhead, tipo: "linea" },
          { label: "Intereses de la deuda", get: (m: PnLFila) => -(m.intereses ?? 0), totalVal: -total.intereses, tipo: "linea" },
          { label: "Amortización de principal", get: (m: PnLFila) => -(m.principal ?? 0), totalVal: -total.principal, tipo: "linea" },
          { label: "Caja neta", get: (m: PnLFila) => m.caja ?? 0, totalVal: total.caja, tipo: "resultado" },
        ] as const)
      : []),
  ];

  const ratios: { label: string; get: (m: PnLFila) => string; total: string }[] = [
    {
      label: "Margen NOI",
      get: (m) => (m.brutos > 0 ? pct(m.noi / m.brutos) : "-"),
      total: total.brutos > 0 ? pct(total.noi / total.brutos) : "-",
    },
    ...(esCash
      ? [
          {
            label: "DSCR (NOI / servicio de deuda)",
            get: (m: PnLFila) => {
              const servicio = (m.intereses ?? 0) + (m.principal ?? 0);
              return servicio > 0 ? `${(m.noi / servicio).toFixed(2).replace(".", ",")}x` : "-";
            },
            total:
              total.intereses + total.principal > 0
                ? `${(total.noi / (total.intereses + total.principal)).toFixed(2).replace(".", ",")}x`
                : "-",
          },
          {
            label: "Margen de caja",
            get: (m: PnLFila) => (m.brutos > 0 ? pct((m.caja ?? 0) / m.brutos) : "-"),
            total: total.brutos > 0 ? pct(total.caja / total.brutos) : "-",
          },
        ]
      : []),
  ];

  const filaCls: Record<Tipo, string> = {
    linea: "text-muted",
    subtotal: "font-semibold text-ink",
    resultado: "font-semibold text-ink",
  };
  const fondo = (t: Tipo) => (t === "resultado" ? "bg-brand-soft" : "");
  const valorCls = (t: Tipo, v: number) =>
    t !== "linea" && v < 0 ? "text-bad" : "";

  return (
    <div>
      <div className="scroll-x">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th className="col-fija px-3 py-2.5 text-left">Concepto</th>
              {serie.map((m) => (
                <th key={m.mes} className="px-2.5 py-2.5 text-right">
                  <span className="capitalize">{mesCorto(m.mes)}</span>
                  {m.costesEstimados && (
                    <span className="ml-0.5 text-brand" title="Costes estimados (run-rate)">
                      ~
                    </span>
                  )}
                  {m.costesPendientes && (
                    <span className="ml-0.5 text-warn" title="Costes pendientes">
                      •
                    </span>
                  )}
                </th>
              ))}
              <th className="border-l border-line px-3 py-2.5 text-right text-ink">12 meses</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.label} className={filaCls[f.tipo]}>
                <td
                  className={`col-fija whitespace-nowrap px-3 py-2 text-left ${f.tipo === "linea" ? "pl-6" : ""} ${fondo(f.tipo)}`}
                >
                  {f.label}
                </td>
                {serie.map((m) => {
                  const v = f.get(m);
                  return (
                    <td
                      key={m.mes}
                      className={`whitespace-nowrap px-2.5 py-2 text-right ${fondo(f.tipo)} ${valorCls(f.tipo, v)}`}
                    >
                      {v === 0 ? "-" : eur(v)}
                    </td>
                  );
                })}
                <td
                  className={`whitespace-nowrap border-l border-line px-3 py-2 text-right font-semibold ${f.tipo === "resultado" ? "bg-brand-tint/60" : "bg-surface-2"} ${valorCls(f.tipo === "linea" ? "subtotal" : f.tipo, f.totalVal)} ${f.tipo === "linea" ? "text-ink" : ""}`}
                >
                  {eur(f.totalVal)}
                </td>
              </tr>
            ))}
            {ratios.map((r, i) => (
              <tr key={r.label} className={`text-xs text-muted ${i === 0 ? "border-t-2 border-line" : ""}`}>
                <td className="col-fija whitespace-nowrap px-3 py-2 text-left">{r.label}</td>
                {serie.map((m) => (
                  <td key={m.mes} className="whitespace-nowrap px-2.5 py-2 text-right">
                    {r.get(m)}
                  </td>
                ))}
                <td className="whitespace-nowrap border-l border-line bg-surface-2 px-3 py-2 text-right font-semibold text-ink">
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">
        <span className="text-brand">~</span> costes estimados por run-rate ·{" "}
        <span className="text-warn">•</span> costes pendientes
        {esCash && (
          <>
            {" "}· caja con deuda real por préstamo (cuota fija, saldos a 31/08/2026; Peña asumida
            como Paco Romo hasta la firma) y overhead corporativo de{" "}
            {Math.round(FINANCIACION.overheadAnualEur / 1000)}k EUR/año repartido por cuota de
            ingresos netos. Unidades con coste sin préstamo casado usan el supuesto{" "}
            {Math.round(FINANCIACION.ltv * 100)}% LTV / {FINANCIACION.anosAmortizacion} años /{" "}
            {(FINANCIACION.interesAnual * 100).toFixed(1).replace(".", ",")}%. Las master lease no
            llevan deuda: su &quot;financiación&quot; es la renta, ya incluida en costes fijos.
          </>
        )}
      </p>
    </div>
  );
}
