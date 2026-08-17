import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, KpiCard, SectionTitle, MiniStat } from "@/components/ui";
import MetricChart from "@/components/charts/MetricChart";
import ChannelTable from "@/components/ChannelTable";
import Insights from "@/components/Insights";
import { generarInsights } from "@/lib/insights";
import { generarInsightsForward } from "@/lib/forward-insights";
import ForwardOutlook from "@/components/ForwardOutlook";
import ForwardMatrix, { type FilaForward } from "@/components/ForwardMatrix";
import ForwardMeses, { type MesForward } from "@/components/ForwardMeses";
import { forwardKpis } from "@/lib/forward";
import { sumarMeses } from "@/lib/time";
import PnLTable from "@/components/PnLTable";
import ReviewsCard from "@/components/ReviewsCard";
import OpexDetalle from "@/components/OpexDetalle";
import UnitsTable, { type FilaUnidad } from "@/components/UnitsTable";
import { estadoUnidad } from "@/lib/status";
import { eur, num, pct, mesLabel, delta } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  seriePnL,
  mixCanales,
  estadoDatos,
  statsReservas,
  resumenReviews,
  reviewsNo5,
  costesLimpieza,
  costesPorCategoria,
  noiTTM,
  ttm,
  mesPorDefecto,
  mesPrevio,
  mesesDePeriodo,
  desplazarMeses,
  rangoFechas,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
  type UnidadInfo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function PortfolioPage({
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

  let unidades;
  try {
    unidades = await getUnidades();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <Shell mes={mes} periodo={periodo} unidades={[]} ultima={estado.ultimoExito}>
        <SetupNotice titulo="Base de datos no disponible" detalle={`Detalle tecnico: ${msg}`} />
      </Shell>
    );
  }

  if (unidades.length === 0) {
    return (
      <Shell mes={mes} periodo={periodo} unidades={[]} ultima={estado.ultimoExito}>
        <Banner estado={estado} />
        <SetupNotice titulo="Todavia no hay unidades sincronizadas" />
      </Shell>
    );
  }

  const periodMeses = mesesDePeriodo(mes, periodo);
  const priorMeses = desplazarMeses(periodMeses, -12);
  const prevMes = mesPrevio(mes);
  const mesesTTM = ttm(mes);
  const mesesTTMprev = desplazarMeses(mesesTTM, -12);
  // Proximos 6 meses (relativos a hoy, no al mes seleccionado).
  const mesesForward = Array.from({ length: 6 }, (_, i) =>
    sumarMeses(mesPorDefecto(), i + 1),
  );
  const todos = Array.from(
    new Set([...periodMeses, ...priorMeses, ...mesesTTM, ...mesesTTMprev, prevMes, ...mesesForward]),
  );
  const map = await unidadMesMap(unidades, todos);

  const itemsDe = (meses: string[]): UnidadMes[] =>
    unidades.flatMap((u) =>
      meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x),
    );
  const itemsUnidad = (u: UnidadInfo, meses: string[]): UnidadMes[] =>
    meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);

  const rAct = sumar(itemsDe(periodMeses));
  const rPrior = sumar(itemsDe(priorMeses));
  const rPrev = sumar(itemsDe([prevMes]));
  const esMes = periodo === "mes";

  const occ = ocupacionDe(rAct);
  const adr = adrDe(rAct);
  const revpar = revparDe(rAct);

  const serie = seriePnL(map, unidades, mesesTTM);
  const seriePrior = seriePnL(map, unidades, mesesTTMprev);
  const chartData = serie.map((s) => ({
    mes: s.mes,
    ingresos: s.brutos,
    noi: s.noi,
    adr: s.vendidas > 0 ? s.alojamiento / s.vendidas : null,
    occ: s.disponibles > 0 ? s.vendidas / s.disponibles : null,
  }));
  const totalesChart = (s: typeof serie) => {
    const t = s.reduce(
      (a, m) => ({
        alo: a.alo + m.alojamiento, ven: a.ven + m.vendidas, dis: a.dis + m.disponibles,
        ing: a.ing + m.brutos, noi: a.noi + m.noi,
      }),
      { alo: 0, ven: 0, dis: 0, ing: 0, noi: 0 },
    );
    return {
      ingresos: t.ing, noi: t.noi,
      adr: t.ven > 0 ? t.alo / t.ven : null,
      occ: t.dis > 0 ? t.ven / t.dis : null,
    };
  };
  const ttmTot = totalesChart(serie);
  const ttmPrevTot = totalesChart(seriePrior);

  const { desde, hastaExcl } = rangoFechas(periodMeses);
  const [mix, fwd, stats, revResumen, revNo5, opexCats, cleanCostPortfolio] =
    await Promise.all([
      mixCanales(periodMeses),
      forwardKpis(unidades.map((u) => u.listingId)),
      statsReservas(periodMeses),
      resumenReviews(undefined, desde, hastaExcl),
      reviewsNo5(undefined, desde, hastaExcl),
      costesPorCategoria(periodMeses),
      costesLimpieza(periodMeses),
    ]);

  // Margen NOI y desglose de limpieza (sobre el periodo, portfolio o unidad pnl)
  const margenNOI = rAct.brutos > 0 ? rAct.noi / rAct.brutos : null;
  const margenPrior = rPrior.brutos > 0 ? rPrior.noi / rPrior.brutos : null;
  const rProp = sumar(
    unidades.filter((u) => u.tipo === "propiedad").flatMap((u) => itemsUnidad(u, periodMeses)),
  );
  const rMaster = sumar(
    unidades.filter((u) => u.tipo === "master_lease").flatMap((u) => itemsUnidad(u, periodMeses)),
  );
  const margenProp = rProp.brutos > 0 ? rProp.noi / rProp.brutos : null;
  const margenMaster = rMaster.brutos > 0 ? rMaster.noi / rMaster.brutos : null;

  const unidadesActivas = unidades.filter((u) => u.activo).length;

  // Filas por unidad (agregadas al periodo) + fila total.
  const filas: FilaUnidad[] = unidades.map((u) => {
    const r = sumar(itemsUnidad(u, periodMeses));
    const nt = noiTTM(u, map, mesesTTM);
    const rendimiento = u.tipo === "propiedad" ? nt.yieldPct : u.tipo === "master_lease" ? nt.margenPct : null;
    const umActual = map.get(`${u.listingId}|${mes}`);
    return {
      listingId: u.listingId,
      nickname: u.displayName,
      tipo: u.tipo,
      ocupacion: ocupacionDe(r),
      adr: adrDe(r),
      revpar: revparDe(r),
      netos: r.netos,
      noiMes: r.noi,
      noiTTM: nt.noiTTM,
      rendimiento,
      rendimientoTipo: u.tipo === "propiedad" ? "yield" : u.tipo === "master_lease" ? "margen" : null,
      estado: estadoUnidad({
        tipo: u.tipo,
        ocupacion: ocupacionDe(r),
        mediaOcupacion: occ,
        yieldPct: nt.yieldPct,
        margenPct: nt.margenPct,
      }),
      costesPendientes: umActual?.costesPendientes ?? false,
    };
  });

  // Total portfolio (medias ponderadas y sumas).
  const noiTTMPortfolio = unidades.reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const costeOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const noiTTMOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const total: FilaUnidad = {
    listingId: "__total__",
    nickname: "Portfolio",
    tipo: null,
    ocupacion: occ,
    adr,
    revpar,
    netos: rAct.netos,
    noiMes: rAct.noi,
    noiTTM: noiTTMPortfolio,
    rendimiento: costeOwned > 0 ? (noiTTMOwned / costeOwned) * 100 : null,
    rendimientoTipo: "yield",
    estado: null,
    costesPendientes: false,
  };

  // Insights (portfolio)
  const comisionLimpPortfolio =
    rAct.alojamiento + rAct.limpieza > 0
      ? (rAct.comisiones * rAct.limpieza) / (rAct.alojamiento + rAct.limpieza)
      : 0;
  const limpiezaNetoPortfolio = rAct.limpieza - cleanCostPortfolio - comisionLimpPortfolio;
  const totalRevMix = mix.reduce((s, d) => s + d.revenue, 0);
  const airbnbRev = mix.find((d) => d.canal === "airbnb")?.revenue ?? 0;
  const insights = generarInsights({
    occPortfolio: occ,
    filas: filas.map((f) => ({
      nombre: f.nickname, ocupacion: f.ocupacion, tipo: f.tipo,
      rendimiento: f.rendimiento, rendimientoTipo: f.rendimientoTipo,
      costesPendientes: f.costesPendientes,
    })),
    limpiezaNeto: limpiezaNetoPortfolio,
    limpiezaMargen: rAct.limpieza > 0 ? limpiezaNetoPortfolio / rAct.limpieza : null,
    mixAirbnbPct: totalRevMix > 0 ? airbnbRev / totalRevMix : null,
    ratingMedio: revResumen.ratingMedio,
  });

  // Vision futura: filas por unidad para la matriz y consejos de revenue.
  const ventanasFila = (listingId: string) =>
    (fwd.porUnidad.get(listingId) ?? []).map((v) => ({
      dias: v.dias,
      occ: v.occ,
      adr: v.adr,
      occSTLY: v.occSTLY,
      adrSTLY: v.adrSTLY,
      noches: v.noches,
      disponibles: v.disponibles,
      revenue: v.revenue,
    }));
  const filasFwd: FilaForward[] = unidades.map((u) => ({
    listingId: u.listingId,
    nombre: u.displayName,
    ventanas: ventanasFila(u.listingId),
  }));
  const totalFwd: FilaForward = {
    listingId: "__total__",
    nombre: "Portfolio",
    ventanas: fwd.portfolio.map((v) => ({
      dias: v.dias,
      occ: v.occ,
      adr: v.adr,
      occSTLY: v.occSTLY,
      adrSTLY: v.adrSTLY,
      noches: v.noches,
      disponibles: v.disponibles,
      revenue: v.revenue,
    })),
  };
  const insightsFwd = generarInsightsForward(
    fwd.portfolio,
    unidades.map((u) => ({
      nombre: u.displayName,
      ventanas: fwd.porUnidad.get(u.listingId) ?? [],
    })),
  );
  const mesesFwdFilas: MesForward[] = mesesForward.map((m) => {
    const r = sumar(itemsDe([m]));
    return {
      mes: m,
      noches: r.vendidas,
      disponibles: r.disponibles,
      occ: ocupacionDe(r),
      adr: adrDe(r),
      revpar: revparDe(r),
      revenue: r.alojamiento,
    };
  });

  const etiqueta = etiquetaPeriodo(mes, periodo);

  return (
    <Shell mes={mes} periodo={periodo} unidades={unidades} ultima={estado.ultimoExito}>
      <Banner estado={estado} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-ink">
          Portfolio{" "}
          <span className="text-muted">
            · {etiqueta} ({mesLabel(mes)}) · {num(unidadesActivas)} unidades activas
          </span>
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard label="Ocupacion" value={pct(occ)}
          deltaMoM={esMes ? delta(occ, ocupacionDe(rPrev)) : undefined}
          deltaYoY={delta(occ, ocupacionDe(rPrior))} />
        <KpiCard label="ADR" value={eur(adr)}
          deltaMoM={esMes ? delta(adr, adrDe(rPrev)) : undefined}
          deltaYoY={delta(adr, adrDe(rPrior))} />
        <KpiCard label="RevPAR" value={eur(revpar)}
          deltaMoM={esMes ? delta(revpar, revparDe(rPrev)) : undefined}
          deltaYoY={delta(revpar, revparDe(rPrior))} />
        <KpiCard label="Ingresos netos" value={eur(rAct.netos)}
          deltaMoM={esMes ? delta(rAct.netos, rPrev.netos) : undefined}
          deltaYoY={delta(rAct.netos, rPrior.netos)} />
        <KpiCard label="NOI" value={eur(rAct.noi)}
          deltaMoM={esMes ? delta(rAct.noi, rPrev.noi) : undefined}
          deltaYoY={delta(rAct.noi, rPrior.noi)} />
        <KpiCard label="Margen NOI" value={pct(margenNOI)}
          deltaMoM={esMes ? delta(margenNOI, rPrev.brutos > 0 ? rPrev.noi / rPrev.brutos : null) : undefined}
          deltaYoY={delta(margenNOI, margenPrior)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Ingresos brutos" value={eur(rAct.brutos)} />
        <MiniStat label="Noches vendidas" value={num(rAct.vendidas)} />
        <MiniStat label="Noches disponibles" value={num(rAct.disponibles)} />
        <MiniStat label="Noches bloqueadas" value={num(rAct.bloqueadas)} />
        <MiniStat label="Estancia media" value={stats.estanciaMedia ? `${stats.estanciaMedia.toFixed(1)} n` : "-"} />
        <MiniStat label="Ventana reserva" value={stats.leadTimeMedio ? `${Math.round(stats.leadTimeMedio)} d` : "-"} />
      </div>

      {insights.length > 0 && (
        <Card>
          <SectionTitle>Insights y recomendaciones</SectionTitle>
          <Insights insights={insights} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Evolucion (ultimos 12 meses)</SectionTitle>
          <MetricChart data={chartData} ttm={ttmTot} ttmPrev={ttmPrevTot} />
        </Card>
        <Card>
          <SectionTitle>Mix de canales · {etiqueta}</SectionTitle>
          <ChannelTable data={mix} />
        </Card>
      </div>

      <Card>
        <SectionTitle>Vision futura · proximos 15/30/60/90 dias (on the books)</SectionTitle>
        <ForwardOutlook ventanas={fwd.portfolio} />
        {insightsFwd.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              Consejos de revenue
            </h3>
            <Insights insights={insightsFwd} />
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Ocupacion y ADR futuros por unidad</SectionTitle>
        <ForwardMatrix filas={filasFwd} total={totalFwd} mes={mes} />
      </Card>

      <Card>
        <SectionTitle>Proximos 6 meses (on the books)</SectionTitle>
        <ForwardMeses filas={mesesFwdFilas} />
      </Card>

      <Card>
        <SectionTitle>Reviews · {etiqueta}</SectionTitle>
        <ReviewsCard resumen={revResumen} no5={revNo5} />
      </Card>

      <Card>
        <SectionTitle>Unidades · {etiqueta}</SectionTitle>
        <UnitsTable filas={filas} mes={mes} total={total} />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            P&amp;L del portfolio (ultimos 12 meses)
          </h2>
          <a
            href={`/pnl?mes=${mes}&periodo=${periodo}`}
            className="text-sm font-medium text-brand hover:text-brand-ink"
          >
            Ver P&amp;L por unidad →
          </a>
        </div>
        <PnLTable serie={serie} />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Margen NOI total" value={pct(margenNOI)} />
        <MiniStat label="Margen NOI propiedad" value={pct(margenProp)} />
        <MiniStat label="Margen NOI master lease" value={pct(margenMaster)} />
        <MiniStat
          label="Limpieza neta"
          value={`${eur(limpiezaNetoPortfolio)}${rAct.limpieza > 0 ? ` (${pct(limpiezaNetoPortfolio / rAct.limpieza)})` : ""}`}
        />
      </div>

      <Card>
        <SectionTitle>Desglose de costes · {etiqueta}</SectionTitle>
        <OpexDetalle categorias={opexCats} ingresos={rAct.brutos} />
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
