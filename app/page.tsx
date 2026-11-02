import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader, KpiCard, LinkFlecha } from "@/components/ui";
import MetricChart from "@/components/charts/MetricChart";
import ChannelTable from "@/components/ChannelTable";
import Insights from "@/components/Insights";
import { generarInsights } from "@/lib/insights";
import { generarInsightsForward } from "@/lib/forward-insights";
import ForwardOutlook from "@/components/ForwardOutlook";
import ForwardMeses, { type MesForward } from "@/components/ForwardMeses";
import { forwardKpis } from "@/lib/forward";
import { sumarMeses } from "@/lib/time";
import ReviewsCard from "@/components/ReviewsCard";
import UnitsTable, { type FilaUnidad } from "@/components/UnitsTable";
import { estadoUnidad } from "@/lib/status";
import { eur, num, pct, delta } from "@/lib/format";
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
      <AppShell titulo="Resumen" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Base de datos no disponible" detalle={`Detalle técnico: ${msg}`} />
      </AppShell>
    );
  }

  if (unidades.length === 0) {
    return (
      <AppShell titulo="Resumen" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Todavía no hay unidades sincronizadas" />
      </AppShell>
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
  const [mix, fwd, stats, revResumen, revNo5, cleanCostPortfolio] =
    await Promise.all([
      mixCanales(periodMeses),
      forwardKpis(unidades.map((u) => u.listingId)),
      statsReservas(periodMeses),
      resumenReviews(undefined, desde, hastaExcl),
      reviewsNo5(undefined, desde, hastaExcl),
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

  // Vision futura: consejos de revenue del portfolio.
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
  const opts = unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }));

  return (
    <AppShell
      titulo="Resumen"
      subtitulo={`Portfolio · ${etiqueta} · ${num(unidadesActivas)} unidades activas`}
      contexto={{ mes, periodo, unidades: opts }}
      estado={estado}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Ocupación" value={pct(occ)}
          sub={`${num(rAct.vendidas)} de ${num(rAct.disponibles)} noches${rAct.bloqueadas > 0 ? ` · ${num(rAct.bloqueadas)} bloqueadas` : ""}`}
          deltaMoM={esMes ? delta(occ, ocupacionDe(rPrev)) : undefined}
          deltaYoY={delta(occ, ocupacionDe(rPrior))} />
        <KpiCard label="ADR" value={eur(adr)}
          sub={stats.estanciaMedia ? `Estancia media ${stats.estanciaMedia.toFixed(1).replace(".", ",")} noches` : undefined}
          deltaMoM={esMes ? delta(adr, adrDe(rPrev)) : undefined}
          deltaYoY={delta(adr, adrDe(rPrior))} />
        <KpiCard label="RevPAR" value={eur(revpar)}
          sub={stats.leadTimeMedio ? `Ventana de reserva ${Math.round(stats.leadTimeMedio)} días` : undefined}
          deltaMoM={esMes ? delta(revpar, revparDe(rPrev)) : undefined}
          deltaYoY={delta(revpar, revparDe(rPrior))} />
        <KpiCard label="Ingresos netos" value={eur(rAct.netos)}
          sub={`Brutos ${eur(rAct.brutos)}`}
          deltaMoM={esMes ? delta(rAct.netos, rPrev.netos) : undefined}
          deltaYoY={delta(rAct.netos, rPrior.netos)} />
        <KpiCard label="NOI" value={eur(rAct.noi)}
          sub={rAct.limpieza > 0 ? `Limpieza neta ${eur(limpiezaNetoPortfolio)}` : undefined}
          deltaMoM={esMes ? delta(rAct.noi, rPrev.noi) : undefined}
          deltaYoY={delta(rAct.noi, rPrior.noi)} />
        <KpiCard label="Margen NOI" value={pct(margenNOI)}
          sub={`Propiedad ${pct(margenProp, 0)} · Master lease ${pct(margenMaster, 0)}`}
          deltaMoM={esMes ? delta(margenNOI, rPrev.brutos > 0 ? rPrev.noi / rPrev.brutos : null) : undefined}
          deltaYoY={delta(margenNOI, margenPrior)} />
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader
            titulo="Lectura del periodo"
            descripcion="Lo que destaca en las cifras de arriba"
            accion={<LinkFlecha href="/acciones">Centro de acciones</LinkFlecha>}
          />
          <Insights insights={insights} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader titulo="Evolución" descripcion="Últimos 12 meses" />
          <MetricChart data={chartData} ttm={ttmTot} ttmPrev={ttmPrevTot} />
        </Card>
        <Card>
          <CardHeader titulo="Mix de canales" descripcion={etiqueta} />
          <ChannelTable data={mix} />
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Visión futura"
          descripcion="Ocupación y ADR ya reservados para los próximos días, frente al mismo punto del año pasado"
          accion={<LinkFlecha href={`/unidades?mes=${mes}&periodo=${periodo}#futuro`}>Por unidad</LinkFlecha>}
        />
        <ForwardOutlook ventanas={fwd.portfolio} />
        {insightsFwd.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2.5 text-sm font-semibold text-ink">Consejos de revenue</h3>
            <Insights insights={insightsFwd} />
          </div>
        )}
        <div className="mt-5">
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Próximos 6 meses</h3>
          <ForwardMeses filas={mesesFwdFilas} />
        </div>
      </Card>

      <Card>
        <CardHeader
          titulo="Unidades"
          descripcion={etiqueta}
          accion={<LinkFlecha href={`/unidades?mes=${mes}&periodo=${periodo}`}>Cuadro de mando</LinkFlecha>}
        />
        <UnitsTable filas={filas} mes={mes} total={total} />
      </Card>

      <Card>
        <CardHeader titulo="Reviews" descripcion={etiqueta} />
        <ReviewsCard resumen={revResumen} no5={revNo5} />
      </Card>
    </AppShell>
  );
}
