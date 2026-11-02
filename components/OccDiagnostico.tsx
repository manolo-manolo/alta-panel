import InsightItem from "@/components/InsightItem";
import type { DiagnosticoOcupacion } from "@/lib/occ-diagnostico";
import { mesLabel, num, pct } from "@/lib/format";

// De donde sale la ocupacion de 12 meses: embudo de noches, causas ordenadas
// por noches, y desglose por mes y por unidad. Server component.

const FUENTE: Record<string, string> = {
  ajustes: "Ajustes",
  hoja: "hoja de costes",
  primera_noche: "1.ª reserva",
};

function fecha(d: string | null): string {
  if (!d) return "-";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
}

function Fila({
  label,
  valor,
  menos = false,
  fuerte = false,
}: {
  label: string;
  valor: string;
  menos?: boolean;
  fuerte?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-3 py-2 ${fuerte ? "bg-surface-2" : ""}`}>
      <dt className={fuerte ? "font-semibold text-ink" : "text-muted"}>{label}</dt>
      <dd className={`tabular ${fuerte ? "font-semibold text-ink" : menos ? "text-muted" : "text-ink"}`}>
        {menos ? `− ${valor}` : valor}
      </dd>
    </div>
  );
}

export default function OccDiagnostico({ d }: { d: DiagnosticoOcupacion }) {
  const t = d.total;
  const sinVender = Math.max(0, t.disponibles - t.vendidas);
  const maxOcc = Math.max(0.01, ...d.porMes.map((m) => (m.disponibles > 0 ? m.vendidas / m.disponibles : 0)));
  const unidades = [...d.unidades].sort(
    (a, b) => Math.max(0, b.disponibles - b.vendidas) - Math.max(0, a.disponibles - a.vendidas),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,19rem)_1fr]">
        <div>
          <div className="tabular text-[1.625rem] leading-tight font-semibold tracking-tight text-ink">
            {pct(d.ocupacion)}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {num(t.vendidas)} noches vendidas de {num(t.disponibles)} a la venta ·{" "}
            {num(sinVender)} sin vender
          </p>
          <dl className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
            <Fila label="Noches de calendario" valor={num(t.calendario)} />
            {t.antesInicio > 0 && <Fila label="Antes del inicio de operación" valor={num(t.antesInicio)} menos />}
            {t.trasBaja > 0 && <Fila label="Tras la baja en Guesty" valor={num(t.trasBaja)} menos />}
            {t.sinHistorico > 0 && <Fila label="Fuera del histórico" valor={num(t.sinHistorico)} menos />}
            {t.bloqueadas > 0 && <Fila label="Bloqueadas" valor={num(t.bloqueadas)} menos />}
            {t.ocupadasSinIngreso > 0 && (
              <Fila label="Ocupadas sin venta" valor={num(t.ocupadasSinIngreso)} menos />
            )}
            <Fila label="A la venta" valor={num(t.disponibles)} fuerte />
            <Fila label="Vendidas" valor={num(t.vendidas)} />
            <Fila label="Ocupación" valor={pct(d.ocupacion)} fuerte />
          </dl>
        </div>
        <div>
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Por qué sale esta cifra</h3>
          {d.causas.length === 0 ? (
            <p className="text-sm text-muted">
              Sin causas destacables: la ocupación refleja las noches realmente vendidas.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {d.causas.map((c, i) => (
                <InsightItem key={i} tono={c.tono} texto={c.texto} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Por mes</h3>
          <div className="scroll-x">
            <table className="data-table min-w-[300px]">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left">Mes</th>
                  <th className="px-3 py-2 text-left">Ocupación</th>
                  <th className="px-3 py-2 text-right" title="Vendidas / a la venta">Noches</th>
                </tr>
              </thead>
              <tbody>
                {d.porMes.map((m) => {
                  const o = m.disponibles > 0 ? m.vendidas / m.disponibles : null;
                  return (
                    <tr key={m.mes}>
                      <td className="px-3 py-2 text-left whitespace-nowrap capitalize">{mesLabel(m.mes)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="hidden h-1.5 w-16 shrink-0 rounded-full bg-surface-3 sm:block" aria-hidden>
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${o !== null ? Math.min(1, o / maxOcc) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="tabular w-12 text-right">{pct(o)}</span>
                        </div>
                      </td>
                      <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                        {num(m.vendidas)} <span className="text-faint">/ {num(m.disponibles)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-3">
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Por unidad</h3>
          <div className="scroll-x">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr>
                  <th className="col-fija px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">Occ</th>
                  <th className="px-3 py-2 text-right">Sin vender</th>
                  <th className="px-3 py-2 text-right">% del hueco</th>
                  <th className="px-3 py-2 text-right">A la venta</th>
                  <th className="px-3 py-2 text-left">Cuenta desde</th>
                </tr>
              </thead>
              <tbody>
                {unidades.map((u) => {
                  const o = u.disponibles > 0 ? u.vendidas / u.disponibles : null;
                  const hueco = Math.max(0, u.disponibles - u.vendidas);
                  return (
                    <tr key={u.listingId}>
                      <td className="col-fija px-3 py-2 text-left font-medium whitespace-nowrap">
                        {u.nombre}
                        {!u.activo && <span className="ml-1.5 text-xs font-normal text-faint">baja</span>}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{pct(o)}</td>
                      <td className="tabular px-3 py-2 text-right">{num(hueco)}</td>
                      <td className="tabular px-3 py-2 text-right text-muted">
                        {sinVender > 0 ? pct(hueco / sinVender, 0) : "-"}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-muted">{num(u.disponibles)}</td>
                      <td className="px-3 py-2 text-left whitespace-nowrap">
                        <span className="tabular">{fecha(u.inicio)}</span>
                        {u.fuenteInicio && (
                          <span className="ml-1.5 text-xs text-faint">{FUENTE[u.fuenteInicio]}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="text-xs text-faint">
        Ocupación = noches vendidas / noches a la venta (por mes: vendidas / a la venta). A la venta = noches libres o vendidas desde
        el inicio de operación de cada unidad, sin bloqueos ni noches ocupadas por reservas que no
        son venta. El mes en curso no entra hasta que termina.
      </p>
    </div>
  );
}
