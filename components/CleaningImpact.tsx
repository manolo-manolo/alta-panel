import { eur, pct } from "@/lib/format";

/**
 * Impacto neto de la limpieza en el P&L: ingresos de limpieza menos el coste
 * de limpieza y la comision de OTA atribuible a esos ingresos de limpieza.
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
  const fila = (label: string, valor: number, signo: "+" | "-" | "=") => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tabular ${signo === "-" ? "text-bad" : "text-ink"}`}>
        {signo === "-" ? "-" : signo === "+" ? "" : ""}
        {eur(Math.abs(valor))}
      </span>
    </div>
  );
  return (
    <div>
      {fila("Ingresos limpieza", ingresos, "+")}
      {fila("Costes limpieza", costes, "-")}
      {fila("Comision OTA sobre limpieza", comision, "-")}
      <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
        <span className="font-semibold text-ink">Impacto neto limpieza</span>
        <span className={`tabular font-semibold ${neto >= 0 ? "text-ok" : "text-bad"}`}>
          {eur(neto)}
        </span>
      </div>
      {margen !== null && (
        <p className="mt-1 text-xs text-faint">
          Margen sobre ingresos de limpieza: {pct(margen)}
        </p>
      )}
    </div>
  );
}
