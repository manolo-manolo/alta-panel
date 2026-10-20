import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, SectionTitle } from "@/components/ui";
import UnitsCommandTable, { type FilaMando } from "@/components/UnitsCommandTable";
import { seriePnLCash, breakEvenOcc } from "@/lib/finance";
import {
  cargarContexto,
  datosUnidad,
  accionesDeUnidad,
  finDe,
  itemsUnidad,
} from "@/lib/acciones";
import type { AccionUnidad } from "@/lib/unit-actions";
import { mesLabel, eur } from "@/lib/format";
import {
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  noiTTM,
  estadoDatos,
  mesPorDefecto,
  etiquetaPeriodo,
  type Periodo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
const PERIODOS = ["mes", "ytd", "ttm", "ano"];

// Mismos estilos que el componente Insights, en columna unica y con euros.
const ESTILO: Record<AccionUnidad["tono"], string> = {
  alerta: "border-l-bad bg-bad-soft/40",
  bueno: "border-l-ok bg-ok-soft/40",
  info: "border-l-brand bg-surface-2",
};
const ICONO: Record<AccionUnidad["tono"], string> = { alerta: "▲", bueno: "●", info: "◆" };
const ICONO_COLOR: Record<AccionUnidad["tono"], string> = {
  alerta: "text-bad",
  bueno: "text-ok",
  info: "text-brand",
};

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo: Periodo = (PERIODOS.includes(sp.periodo ?? "") ? sp.periodo : "mes") as Periodo;

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const ctx = await cargarContexto(mes, periodo);
  const { unidades, map, mesesTTM, periodMeses } = ctx;
  if (unidades.length === 0) {
    return (
      <Shell mes={mes} periodo={periodo} unidades={[]} ultima={estado.ultimoExito}>
        <Banner estado={estado} />
        <SetupNotice titulo="Todavia no hay unidades sincronizadas" />
      </Shell>
    );
  }

  const rPortfolio = sumar(unidades.flatMap((u) => itemsUnidad(map, u, periodMeses)));
  const occPortfolio = ocupacionDe(rPortfolio);

  const filas: FilaMando[] = [];
  const accionesPorUnidad: {
    listingId: string;
    nombre: string;
    acciones: AccionUnidad[];
    potencial: number;
  }[] = [];

  for (const u of unidades) {
    const d = datosUnidad(ctx, u);
    filas.push({
      listingId: u.listingId,
      nombre: u.displayName,
      tipo: u.tipo,
      occ: ocupacionDe(d.r),
      adr: adrDe(d.r),
      revpar: revparDe(d.r),
      netos: d.r.netos,
      noi: d.r.noi,
      caja: d.caja,
      rendimiento: u.tipo === "propiedad" ? d.nt.yieldPct : u.tipo === "master_lease" ? d.nt.margenPct : null,
      rendimientoTipo: u.tipo === "propiedad" ? "yield" : u.tipo === "master_lease" ? "margen" : null,
      occBreakEven: d.occBreakEven,
      occTTM: ocupacionDe(d.rTTM),
      rating90: d.rating?.media ?? null,
      numReviews90: d.rating?.n ?? 0,
      otbOcc: d.v30?.occ ?? null,
      otbOccSTLY: d.v30?.occSTLY ?? null,
      otbNoches: d.v30?.noches ?? 0,
      otbDisponibles: d.v30?.disponibles ?? 0,
      costesPendientes: d.costesPendientes,
    });

    const acciones = accionesDeUnidad(ctx, u, d);
    if (acciones.length > 0) {
      accionesPorUnidad.push({
        listingId: u.listingId,
        nombre: u.displayName,
        acciones,
        potencial: acciones
          .filter((a) => a.tono !== "info")
          .reduce((s, a) => s + (a.impacto ?? 0), 0),
      });
    }
  }
  accionesPorUnidad.sort((a, b) => b.potencial - a.potencial);

  // Fila total del portfolio.
  const rTTMp = sumar(unidades.flatMap((u) => itemsUnidad(map, u, mesesTTM)));
  const cashPortfolio = seriePnLCash(
    ctx.seriePortfolioPeriodo,
    ctx.seriePortfolioPeriodo,
    unidades.map(finDe),
    unidades.length,
  );
  const cashTTMp = seriePnLCash(
    ctx.seriePortfolioTTM,
    ctx.seriePortfolioTTM,
    unidades.map(finDe),
    unidades.length,
  );
  const ratingTot = [...ctx.ratings.values()].reduce(
    (a, r) => ({ suma: a.suma + r.media * r.n, n: a.n + r.n }),
    { suma: 0, n: 0 },
  );
  const costeOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const noiTTMOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const v30Port = ctx.fwd.portfolio.find((v) => v.dias === 30);
  const total: FilaMando = {
    listingId: "__total__",
    nombre: "Portfolio",
    tipo: null,
    occ: occPortfolio,
    adr: adrDe(rPortfolio),
    revpar: revparDe(rPortfolio),
    netos: rPortfolio.netos,
    noi: rPortfolio.noi,
    caja: cashPortfolio.reduce((s, m) => s + m.caja, 0),
    rendimiento: costeOwned > 0 ? (noiTTMOwned / costeOwned) * 100 : null,
    rendimientoTipo: "yield",
    occBreakEven: breakEvenOcc({
      netos: rTTMp.netos,
      costesVariables: rTTMp.costesVariables,
      costesFijos: rTTMp.costesFijos,
      vendidas: rTTMp.vendidas,
      disponibles: rTTMp.disponibles,
      overhead: cashTTMp.reduce((s, m) => s + m.overhead, 0),
      servicioDeuda: cashTTMp.reduce((s, m) => s + m.intereses + m.principal, 0),
    }),
    occTTM: ocupacionDe(rTTMp),
    rating90: ratingTot.n > 0 ? ratingTot.suma / ratingTot.n : null,
    numReviews90: ratingTot.n,
    otbOcc: v30Port?.occ ?? null,
    otbOccSTLY: v30Port?.occSTLY ?? null,
    otbNoches: v30Port?.noches ?? 0,
    otbDisponibles: v30Port?.disponibles ?? 0,
    costesPendientes: false,
  };

  const etiqueta = etiquetaPeriodo(mes, periodo);
  const potencialTotal = accionesPorUnidad.reduce((s, a) => s + a.potencial, 0);

  return (
    <Shell mes={mes} periodo={periodo} unidades={unidades} ultima={estado.ultimoExito}>
      <Banner estado={estado} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-ink">
          Unidades{" "}
          <span className="text-muted">· {etiqueta} ({mesLabel(mes)})</span>
        </h1>
      </div>

      <Card>
        <SectionTitle>Cuadro de mando por unidad</SectionTitle>
        <UnitsCommandTable filas={filas} total={total} mes={mes} />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            Acciones por unidad
          </h2>
          {potencialTotal > 0 && (
            <span className="text-sm text-muted">
              Potencial identificado ≈{" "}
              <span className="font-semibold text-ink">{eur(potencialTotal)}</span>
            </span>
          )}
        </div>
        {accionesPorUnidad.length === 0 ? (
          <p className="text-sm text-faint">Sin acciones pendientes: todo en banda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {accionesPorUnidad.map((a) => (
              <div key={a.listingId}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <a
                    href={`/unidad/${a.listingId}?mes=${mes}&periodo=${periodo}`}
                    className="text-sm font-semibold text-ink hover:text-brand"
                  >
                    {a.nombre}
                  </a>
                  {a.potencial > 0 && (
                    <span className="text-xs text-muted">≈ {eur(a.potencial)}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {a.acciones.map((it, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 rounded-md border border-line border-l-4 px-3 py-2 text-sm ${ESTILO[it.tono]}`}
                    >
                      <span className={`${ICONO_COLOR[it.tono]} shrink-0`}>{ICONO[it.tono]}</span>
                      <span className="min-w-0 flex-1 text-ink">{it.texto}</span>
                      {it.impacto !== null && it.impacto >= 50 && (
                        <span className="tabular shrink-0 self-start text-xs font-semibold text-ink">
                          {eur(it.impacto)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-faint">
          Euros estimados con supuestos conservadores (subida del 10% sobre noches por vender,
          relleno parcial de huecos y noches libres, margen por noche real de cada unidad). Son
          ordenes de magnitud para priorizar, no previsiones.
        </p>
      </Card>
    </Shell>
  );
}

function Shell({
  mes,
  periodo,
  unidades,
  ultima,
  children,
}: {
  mes: string;
  periodo: string;
  unidades: { listingId: string; displayName: string }[];
  ultima: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        periodo={periodo}
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={ultima}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
