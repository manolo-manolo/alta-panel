import { requireSesion } from "@/lib/session";
import { Download } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import { Card, CardHeader, StatGrid, pillClass } from "@/components/ui";
import { eur, pct, num } from "@/lib/format";
import { estadoDatos, mesPorDefecto } from "@/lib/metrics";
import {
  calcularEstacionalidad,
  type UnidadEstacionalidad,
  type IndiceMes,
} from "@/lib/seasonality";

export const dynamic = "force-dynamic";

const MESES_L = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function idxFmt(v: number | null): string {
  if (v === null) return "-";
  return v.toFixed(2);
}

function TablaEstacionalidad({
  u,
  indices,
  esPortfolio,
}: {
  u: UnidadEstacionalidad;
  indices: IndiceMes[];
  esPortfolio: boolean;
}) {
  return (
    <div className="scroll-x">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th className="col-fija px-3 py-2.5 text-left">Mes</th>
            <th className="px-3 py-2.5 text-right">Ocupación</th>
            <th className="px-3 py-2.5 text-right">ADR sin limpieza</th>
            <th className="px-3 py-2.5 text-right">ADR con limpieza</th>
            <th className="px-3 py-2.5 text-right">RevPAR sin</th>
            <th className="px-3 py-2.5 text-right">RevPAR con</th>
            {esPortfolio && (
              <>
                <th className="px-3 py-2.5 text-right">Índice ADR</th>
                <th className="px-3 py-2.5 text-right">Índice Occ</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {u.meses.map((m) => (
            <tr key={m.calMes}>
              <td className="col-fija whitespace-nowrap px-3 py-2 text-left font-medium">
                {MESES_L[m.calMes - 1]}
                {m.fuente === "otb" && (
                  <span
                    className="ml-1 text-xs text-ok"
                    title="Reservas ya en cartera: precio contratado y ocupación reservada como suelo"
                  >
                    (otb)
                  </span>
                )}
                {m.fuente === "estimado" && m.estimado && (
                  <span className="ml-1 text-xs text-brand" title="Estimado por nivel x índice">
                    (est.)
                  </span>
                )}
                {m.fuente === "real" && m.nObs > 0 && !esPortfolio && (
                  <span className="ml-1 text-xs text-faint">({m.nObs} obs)</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">{pct(m.occ)}</td>
              <td className="px-3 py-2 text-right text-ink">{eur(m.adrSin)}</td>
              <td className="px-3 py-2 text-right">{eur(m.adrCon)}</td>
              <td className="px-3 py-2 text-right text-ink">{eur(m.revparSin)}</td>
              <td className="px-3 py-2 text-right">{eur(m.revparCon)}</td>
              {esPortfolio && (
                <>
                  <td className="px-3 py-2 text-right text-muted">
                    {idxFmt(indices[m.calMes - 1]?.idxAdr ?? null)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted">
                    {idxFmt(indices[m.calMes - 1]?.idxOcc ?? null)}
                  </td>
                </>
              )}
            </tr>
          ))}
          <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
            <td className="col-fija whitespace-nowrap bg-surface-2 px-3 py-2.5 text-left">
              Año completo{u.ano.algunEstimado ? " (con estimados)" : ""}
            </td>
            <td className="px-3 py-2.5 text-right">{pct(u.ano.occ)}</td>
            <td className="px-3 py-2.5 text-right">{eur(u.ano.adrSin)}</td>
            <td className="px-3 py-2.5 text-right">{eur(u.ano.adrCon)}</td>
            <td className="px-3 py-2.5 text-right">{eur(u.ano.revparSin)}</td>
            <td className="px-3 py-2.5 text-right">{eur(u.ano.revparCon)}</td>
            {esPortfolio && <td colSpan={2} />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function EstacionalidadPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string; unidad?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo = sp.periodo ?? "mes";

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const est = await calcularEstacionalidad();
  const sel = sp.unidad
    ? est.unidades.find((u) => u.nombre === sp.unidad)
    : undefined;
  const activa = sel ?? est.portfolio;

  return (
    <AppShell
      titulo="Estacionalidad"
      subtitulo={`ADR y ocupación realistas por mes para underwriting · datos cerrados hasta ${est.cierre}`}
      acciones={
        <a
          href="/api/estacionalidad"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-card transition hover:border-brand hover:text-brand"
        >
          <Download size={15} aria-hidden />
          Descargar CSV
        </a>
      }
      estado={estado}
      mes={mes}
      periodo={periodo}
    >
        <StatGrid
          className="lg:grid-cols-4"
          items={[
            { label: "ADR sin limpieza (global)", value: eur(est.global.adrSin) },
            { label: "ADR con limpieza (global)", value: eur(est.global.adrCon) },
            { label: "Ocupación (global)", value: pct(est.global.occ) },
            { label: "Noches en la muestra", value: num(est.global.noches) },
          ]}
        />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <a href="/estacionalidad" className={pillClass(!sel)}>
            Portfolio
          </a>
          {est.unidades.map((u) => (
            <a
              key={u.nombre}
              href={`/estacionalidad?unidad=${encodeURIComponent(u.nombre)}`}
              className={pillClass(sel?.nombre === u.nombre)}
            >
              {u.nombre}
            </a>
          ))}
        </div>

        <Card>
          <CardHeader
            titulo={`${activa.nombre} · por mes calendario`}
            descripcion={
              sel
                ? `${sel.mesesConDatos} meses de datos reales${sel.rampMes ? ` · ${sel.rampMes} excluido como rampa de apertura` : ""}${sel.usaOTB ? " · nivel calibrado con reservas en cartera" : ""}`
                : "Media de toda la cartera e índices de estacionalidad"
            }
          />
          <TablaEstacionalidad u={activa} indices={est.indices} esPortfolio={!sel} />
        </Card>

        <Card>
          <CardHeader titulo="Método" descripcion="Cálculo sobre datos reales, sin supuestos inventados" />
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>
              Solo meses cerrados. ADR sin limpieza = alojamiento / noches vendidas;
              ADR con limpieza añade el ingreso de limpieza. Ocupación ajustada a la
              fecha de inicio real de cada unidad.
            </li>
            <li>
              Índice de estacionalidad del mes = valor de ese mes calendario en todo
              el portfolio / media global (ponderado por noches). Índice 1,00 = mes
              medio.
            </li>
            <li>
              El nivel de ADR de cada unidad se calibra con TODAS sus reservas reales,
              incluidas las futuras en cartera (precios contratados). El nivel de
              ocupación propio se pondera con el del portfolio según los meses
              cerrados disponibles, para que un único mes de apertura no condene la
              proyección.
            </li>
            <li>
              (otb) = mes próximo con reservas ya en cartera: se muestra su ADR
              contratado y la ocupación reservada actúa como suelo. (est.) = nivel
              propio x índice del portfolio.
            </li>
            <li>
              El primer mes de operación de cada unidad se excluye como rampa de
              apertura (días bloqueados por puesta a punto, sin reviews): no entra
              ni en su calibrado ni en los índices del portfolio.
            </li>
            <li>
              Para underwriting de una unidad nueva: aplica los índices a tu ADR y
              ocupación de referencia. Ojo: un destino de costa (p. ej. Nerja) es más
              estacional que Málaga capital; el verano pesa más y el invierno menos.
            </li>
          </ul>
        </Card>
    </AppShell>
  );
}
