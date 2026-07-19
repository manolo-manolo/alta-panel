import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, KpiCard, SectionTitle, MiniStat } from "@/components/ui";
import NoiRevenueChart from "@/components/charts/NoiRevenueChart";
import ChannelTable from "@/components/ChannelTable";
import PacingStrip from "@/components/PacingStrip";
import PnLTable from "@/components/PnLTable";
import ReviewsCard from "@/components/ReviewsCard";
import CleaningImpact from "@/components/CleaningImpact";
import OpexDetalle from "@/components/OpexDetalle";
import PnLUnitPicker from "@/components/PnLUnitPicker";
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
  pacing,
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
  type Rollup,
  type UnidadInfo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string; pnl?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo: Periodo = (PERIODOS.includes(sp.periodo ?? "") ? sp.periodo : "mes") as Periodo;
  const pnlSel = sp.pnl ?? "";

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
  const todos = Array.from(new Set([...periodMeses, ...priorMeses, ...mesesTTM, prevMes]));
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
  const serieChart = serie.map((s) => ({ mes: s.mes, ingresos: s.brutos, noi: s.noi }));

  // Seleccion de unidad para el P&L (dropdown ?pnl=)
  const unidadPnl = pnlSel ? unidades.find((u) => u.listingId === pnlSel) : undefined;
  const seriePnlSel = unidadPnl ? seriePnL(map, [unidadPnl], mesesTTM) : serie;

  const { desde, hastaExcl } = rangoFechas(periodMeses);
  const [mix, pac, stats, revResumen, revNo5, cleanCost, opexCats] = await Promise.all([
    mixCanales(periodMeses),
    pacing(),
    statsReservas(periodMeses),
    resumenReviews(undefined, desde, hastaExcl),
    reviewsNo5(undefined, desde, hastaExcl),
    costesLimpieza(periodMeses, unidadPnl?.nickname),
    costesPorCategoria(periodMeses, unidadPnl?.nickname),
  ]);

  // Margen NOI y desglose de limpieza (sobre el periodo, portfolio o unidad pnl)
  const rPnl = unidadPnl ? sumar(itemsUnidad(unidadPnl, periodMeses)) : rAct;
  const margenNOI = rAct.brutos > 0 ? rAct.noi / rAct.brutos : null;
  const margenPrior = rPrior.brutos > 0 ? rPrior.noi / rPrior.brutos : null;
  const baseLimp = rPnl.alojamiento + rPnl.limpieza;
  const comisionLimpieza = baseLimp > 0 ? (rPnl.comisiones * rPnl.limpieza) / baseLimp : 0;

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Ingresos y NOI (ultimos 12 meses)</SectionTitle>
          <NoiRevenueChart data={serieChart} />
        </Card>
        <Card>
          <SectionTitle>Mix de canales · {etiqueta}</SectionTitle>
          <ChannelTable data={mix} />
        </Card>
      </div>

      <Card>
        <SectionTitle>Pacing (noches y revenue en cartera)</SectionTitle>
        <PacingStrip pacing={pac} />
      </Card>

      <Card>
        <SectionTitle>Reviews · {etiqueta}</SectionTitle>
        <ReviewsCard resumen={revResumen} no5={revNo5} />
      </Card>

      <Card>
        <SectionTitle>Unidades · {etiqueta}</SectionTitle>
        <UnitsTable filas={filas} mes={mes} total={total} />
      </Card>

      <Card className="scroll-mt-24">
        <div id="pnl" className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">
            P&amp;L (ultimos 12 meses){unidadPnl ? ` · ${unidadPnl.displayName}` : " · portfolio"}
          </h2>
          <PnLUnitPicker
            mes={mes}
            periodo={periodo}
            pnl={pnlSel}
            unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
          />
        </div>
        <PnLTable serie={seriePnlSel} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Limpieza · impacto neto · {etiqueta}</SectionTitle>
          <CleaningImpact ingresos={rPnl.limpieza} costes={cleanCost} comision={comisionLimpieza} />
        </Card>
        <Card>
          <SectionTitle>Desglose de costes · {etiqueta}</SectionTitle>
          <OpexDetalle categorias={opexCats} />
        </Card>
      </div>
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
