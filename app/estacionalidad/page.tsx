import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import { Card, SectionTitle, MiniStat } from "@/components/ui";
import { eur, pct, num } from "@/lib/format";
import { estadoDatos, mesPorDefecto, getUnidades } from "@/lib/metrics";
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
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="px-2 py-2 text-left font-medium">Mes</th>
            <th className="px-2 py-2 text-right font-medium">Ocupacion</th>
            <th className="px-2 py-2 text-right font-medium">ADR sin limpieza</th>
            <th className="px-2 py-2 text-right font-medium">ADR con limpieza</th>
            <th className="px-2 py-2 text-right font-medium">RevPAR sin</th>
            <th className="px-2 py-2 text-right font-medium">RevPAR con</th>
            {esPortfolio && (
              <>
                <th className="px-2 py-2 text-right font-medium">Indice ADR</th>
                <th className="px-2 py-2 text-right font-medium">Indice Occ</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {u.meses.map((m) => (
            <tr key={m.calMes} className="border-b border-line/60">
              <td className="px-2 py-1.5 text-left text-ink">
                {MESES_L[m.calMes - 1]}
                {m.estimado && (
                  <span className="ml-1 text-xs text-brand" title="Estimado por nivel x indice">
                    (est.)
                  </span>
                )}
                {!m.estimado && m.nObs > 0 && !esPortfolio && (
                  <span className="ml-1 text-xs text-faint">
                    ({m.nObs} {m.nObs === 1 ? "obs" : "obs"})
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right">{pct(m.occ)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{eur(m.adrSin)}</td>
              <td className="px-2 py-1.5 text-right">{eur(m.adrCon)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{eur(m.revparSin)}</td>
              <td className="px-2 py-1.5 text-right">{eur(m.revparCon)}</td>
              {esPortfolio && (
                <>
                  <td className="px-2 py-1.5 text-right text-muted">
                    {idxFmt(indices[m.calMes - 1]?.idxAdr ?? null)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted">
                    {idxFmt(indices[m.calMes - 1]?.idxOcc ?? null)}
                  </td>
                </>
              )}
            </tr>
          ))}
          <tr className="border-t-2 border-line font-semibold text-ink">
            <td className="px-2 py-2 text-left">
              Ano completo{u.ano.algunEstimado ? " (con estimados)" : ""}
            </td>
            <td className="px-2 py-2 text-right">{pct(u.ano.occ)}</td>
            <td className="px-2 py-2 text-right">{eur(u.ano.adrSin)}</td>
            <td className="px-2 py-2 text-right">{eur(u.ano.adrCon)}</td>
            <td className="px-2 py-2 text-right">{eur(u.ano.revparSin)}</td>
            <td className="px-2 py-2 text-right">{eur(u.ano.revparCon)}</td>
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

  const [unidadesNav, est] = await Promise.all([getUnidades(), calcularEstacionalidad()]);
  const sel = sp.unidad
    ? est.unidades.find((u) => u.nombre === sp.unidad)
    : undefined;
  const activa = sel ?? est.portfolio;

  const chip = (activo: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-sm transition ${
      activo
        ? "border-brand bg-brand text-white"
        : "border-line bg-surface text-muted hover:border-brand hover:text-brand"
    }`;

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        periodo={periodo}
        unidades={unidadesNav.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink">
            Estacionalidad y benchmarks{" "}
            <span className="text-muted">· datos cerrados hasta {est.cierre}</span>
          </h1>
          <a
            href="/api/estacionalidad"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
          >
            Descargar CSV (para el modelo)
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label="ADR sin limpieza (global)" value={eur(est.global.adrSin)} />
          <MiniStat label="ADR con limpieza (global)" value={eur(est.global.adrCon)} />
          <MiniStat label="Ocupacion (global)" value={pct(est.global.occ)} />
          <MiniStat label="Noches en la muestra" value={num(est.global.noches)} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <a href="/estacionalidad" className={chip(!sel)}>
            Portfolio
          </a>
          {est.unidades.map((u) => (
            <a
              key={u.nombre}
              href={`/estacionalidad?unidad=${encodeURIComponent(u.nombre)}`}
              className={chip(sel?.nombre === u.nombre)}
            >
              {u.nombre}
            </a>
          ))}
        </div>

        <Card>
          <SectionTitle>
            {activa.nombre} · por mes calendario
            {sel && (
              <span className="ml-2 normal-case text-faint">
                {sel.mesesConDatos} meses de datos reales
                {sel.usaOTB ? " · nivel calibrado con reservas en cartera" : ""}
              </span>
            )}
          </SectionTitle>
          <TablaEstacionalidad u={activa} indices={est.indices} esPortfolio={!sel} />
        </Card>

        <Card>
          <SectionTitle>Metodo (calculo, no invencion)</SectionTitle>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>
              Solo meses cerrados. ADR sin limpieza = alojamiento / noches vendidas;
              ADR con limpieza anade el ingreso de limpieza. Ocupacion ajustada a la
              fecha de inicio real de cada unidad.
            </li>
            <li>
              Indice de estacionalidad del mes = valor de ese mes calendario en todo
              el portfolio / media global (ponderado por noches). Indice 1,00 = mes
              medio.
            </li>
            <li>
              Meses sin datos de una unidad: nivel propio desestacionalizado x indice
              del portfolio, marcados (est.). Unidades sin meses cerrados calibran su
              nivel de ADR con sus reservas en cartera.
            </li>
            <li>
              Para underwriting de una unidad nueva: aplica los indices a tu ADR y
              ocupacion de referencia. Ojo: un destino de costa (p. ej. Nerja) es mas
              estacional que Malaga capital; el verano pesa mas y el invierno menos.
            </li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
