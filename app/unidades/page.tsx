import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, SectionTitle } from "@/components/ui";
import UnitsCommandTable, { type FilaMando } from "@/components/UnitsCommandTable";
import { seriePnLCash, type UnidadFinanciacion } from "@/lib/finance";
import { forwardKpis } from "@/lib/forward";
import { accionesUnidad } from "@/lib/unit-actions";
import type { Insight } from "@/lib/insights";
import { hoyMadrid, sumarDias } from "@/lib/time";
import { mesLabel } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  seriePnL,
  noiTTM,
  estadoDatos,
  ratingsPorUnidad,
  ttm,
  mesPorDefecto,
  mesesDePeriodo,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
  type UnidadInfo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
const PERIODOS = ["mes", "ytd", "ttm", "ano"];

// Mismos estilos que el componente Insights, en columna unica.
const ESTILO: Record<Insight["tono"], string> = {
  alerta: "border-l-bad bg-bad-soft/40",
  bueno: "border-l-ok bg-ok-soft/40",
  info: "border-l-brand bg-surface-2",
};
const ICONO: Record<Insight["tono"], string> = { alerta: "▲", bueno: "●", info: "◆" };
const ICONO_COLOR: Record<Insight["tono"], string> = {
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

  const unidades = await getUnidades();
  if (unidades.length === 0) {
    return (
      <Shell mes={mes} periodo={periodo} unidades={[]} ultima={estado.ultimoExito}>
        <Banner estado={estado} />
        <SetupNotice titulo="Todavia no hay unidades sincronizadas" />
      </Shell>
    );
  }

  const periodMeses = mesesDePeriodo(mes, periodo);
  const mesesTTM = ttm(mes);
  const todos = Array.from(new Set([...periodMeses, ...mesesTTM]));
  const desde90 = sumarDias(hoyMadrid(), -90);

  const [map, fwd, ratings] = await Promise.all([
    unidadMesMap(unidades, todos),
    forwardKpis(unidades.map((u) => u.listingId)),
    ratingsPorUnidad(desde90),
  ]);

  const itemsUnidad = (u: UnidadInfo, meses: string[]): UnidadMes[] =>
    meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);

  const seriePortfolio = seriePnL(map, unidades, periodMeses);
  const rPortfolio = sumar(unidades.flatMap((u) => itemsUnidad(u, periodMeses)));
  const occPortfolio = ocupacionDe(rPortfolio);
  const finDe = (u: UnidadInfo): UnidadFinanciacion => ({
    costeAdquisicion: u.costeAdquisicion,
    inicio: u.fechaInicio ?? u.primeraNoche,
  });

  const filas: FilaMando[] = [];
  const accionesPorUnidad: { listingId: string; nombre: string; acciones: Insight[] }[] = [];

  for (const u of unidades) {
    const r = sumar(itemsUnidad(u, periodMeses));
    const cash = seriePnLCash(
      seriePnL(map, [u], periodMeses),
      seriePortfolio,
      [finDe(u)],
      unidades.length,
    );
    const caja = cash.reduce((s, m) => s + m.caja, 0);
    const tieneDeuda = !!(u.costeAdquisicion && u.costeAdquisicion > 0);
    const nt = noiTTM(u, map, mesesTTM);
    const v30 = (fwd.porUnidad.get(u.listingId) ?? []).find((v) => v.dias === 30);
    const rating = ratings.get(u.listingId);
    const costesPendientes = itemsUnidad(u, periodMeses).some((x) => x.costesPendientes);

    filas.push({
      listingId: u.listingId,
      nombre: u.displayName,
      tipo: u.tipo,
      occ: ocupacionDe(r),
      adr: adrDe(r),
      revpar: revparDe(r),
      netos: r.netos,
      noi: r.noi,
      caja,
      rendimiento: u.tipo === "propiedad" ? nt.yieldPct : u.tipo === "master_lease" ? nt.margenPct : null,
      rendimientoTipo: u.tipo === "propiedad" ? "yield" : u.tipo === "master_lease" ? "margen" : null,
      rating90: rating?.media ?? null,
      numReviews90: rating?.n ?? 0,
      otbOcc: v30?.occ ?? null,
      otbOccSTLY: v30?.occSTLY ?? null,
      otbNoches: v30?.noches ?? 0,
      otbDisponibles: v30?.disponibles ?? 0,
      costesPendientes,
    });

    const acciones = accionesUnidad({
      nombre: u.displayName,
      tipo: u.tipo,
      occ: ocupacionDe(r),
      occPortfolio,
      caja,
      tieneDeuda,
      costesPendientes,
      yieldPct: nt.yieldPct,
      margenPct: nt.margenPct,
      otbOcc: v30?.occ ?? null,
      otbOccSTLY: v30?.occSTLY ?? null,
      otbAdr: v30?.adr ?? null,
      otbAdrSTLY: v30?.adrSTLY ?? null,
      otbNoches: v30?.noches ?? 0,
      otbDisponibles: v30?.disponibles ?? 0,
      rating90: rating?.media ?? null,
      numReviews90: rating?.n ?? 0,
    });
    if (acciones.length > 0) {
      accionesPorUnidad.push({ listingId: u.listingId, nombre: u.displayName, acciones });
    }
  }

  // Fila total del portfolio.
  const cashPortfolio = seriePnLCash(
    seriePortfolio,
    seriePortfolio,
    unidades.map(finDe),
    unidades.length,
  );
  const ratingTot = [...ratings.values()].reduce(
    (a, r) => ({ suma: a.suma + r.media * r.n, n: a.n + r.n }),
    { suma: 0, n: 0 },
  );
  const costeOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const noiTTMOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const v30Port = fwd.portfolio.find((v) => v.dias === 30);
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
    rating90: ratingTot.n > 0 ? ratingTot.suma / ratingTot.n : null,
    numReviews90: ratingTot.n,
    otbOcc: v30Port?.occ ?? null,
    otbOccSTLY: v30Port?.occSTLY ?? null,
    otbNoches: v30Port?.noches ?? 0,
    otbDisponibles: v30Port?.disponibles ?? 0,
    costesPendientes: false,
  };

  const etiqueta = etiquetaPeriodo(mes, periodo);

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
        <SectionTitle>Acciones por unidad</SectionTitle>
        {accionesPorUnidad.length === 0 ? (
          <p className="text-sm text-faint">Sin acciones pendientes: todo en banda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {accionesPorUnidad.map((a) => (
              <div key={a.listingId}>
                <a
                  href={`/unidad/${a.listingId}?mes=${mes}&periodo=${periodo}`}
                  className="mb-1.5 inline-block text-sm font-semibold text-ink hover:text-brand"
                >
                  {a.nombre}
                </a>
                <div className="flex flex-col gap-2">
                  {a.acciones.map((it, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 rounded-md border border-line border-l-4 px-3 py-2 text-sm ${ESTILO[it.tono]}`}
                    >
                      <span className={`${ICONO_COLOR[it.tono]} shrink-0`}>{ICONO[it.tono]}</span>
                      <span className="text-ink">{it.texto}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
