import "server-only";

// Centro de acciones: contexto compartido (datos cargados una vez) y
// constructores de acciones por unidad, usados por /acciones y /unidades.
// Las acciones llevan impacto en euros y se ordenan por dinero.

import type { Insight } from "@/lib/insights";
import { generarInsightsForward } from "@/lib/forward-insights";
import { accionesUnidad, type AccionUnidad } from "@/lib/unit-actions";
import { forwardKpis, type ForwardData, type VentanaForward } from "@/lib/forward";
import { inteligenciaRevenue, mesesPaceDesdeHoy, type IntelUnidad } from "@/lib/revenue-intel";
import { costesUnidadCategoriaMes } from "@/lib/costs";
import {
  seriePnLCash,
  prestamoDeUnidad,
  equityUnidad,
  breakEvenOcc,
  lecturaCaja,
  type UnidadFinanciacion,
  type PnLCashMes,
} from "@/lib/finance";
import { hoyMadrid, sumarDias, sumarMeses } from "@/lib/time";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  seriePnL,
  noiTTM,
  ratingsPorUnidad,
  ttm,
  mesPorDefecto,
  mesesDePeriodo,
  type Periodo,
  type PnLMes,
  type Rollup,
  type NoiTTM,
  type RatingUnidad,
  type UnidadInfo,
  type UnidadMes,
} from "@/lib/metrics";

export type AreaAccion = "revenue" | "unidad" | "caja";

export interface Accion extends Insight {
  area: AreaAccion;
  etiqueta: string;
  href: string;
  impacto: number | null;
  palanca: string | null;
}

export interface CentroAcciones {
  mes: string;
  acciones: Accion[];
  alertas: number;
  oportunidades: number;
  avisos: number;
  potencial: number; // suma de impactos de alertas y oportunidades
}

export interface ContextoAcciones {
  mes: string;
  periodMeses: string[];
  mesesTTM: string[];
  unidades: UnidadInfo[];
  map: Map<string, UnidadMes>;
  fwd: ForwardData;
  ratings: Map<string, RatingUnidad>;
  intel: Map<string, IntelUnidad>;
  limpiezaCosteTTM: Map<string, number>; // por nickname
  seriePortfolioPeriodo: PnLMes[];
  seriePortfolioTTM: PnLMes[];
}

export interface DatosUnidad {
  r: Rollup; // periodo
  rTTM: Rollup;
  cashPeriodo: PnLCashMes[];
  cashTTM: PnLCashMes[];
  nt: NoiTTM;
  v30: VentanaForward | undefined;
  v15: VentanaForward | undefined;
  rating: RatingUnidad | undefined;
  occBreakEven: number | null;
  tieneDeuda: boolean;
  costesPendientes: boolean;
  caja: number; // periodo
  intel: IntelUnidad | undefined;
}

const ORDEN_TONO: Record<Insight["tono"], number> = { alerta: 0, bueno: 1, info: 2 };

export function finDe(u: UnidadInfo): UnidadFinanciacion {
  return {
    costeAdquisicion: u.costeAdquisicion,
    inicio: u.fechaInicio ?? u.primeraNoche,
    nombre: u.displayName,
    nickname: u.nickname,
  };
}

export function itemsUnidad(
  map: Map<string, UnidadMes>,
  u: UnidadInfo,
  meses: string[],
): UnidadMes[] {
  return meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);
}

/** Carga todo lo necesario para acciones y cuadro de mando en una pasada. */
export async function cargarContexto(mes: string, periodo: Periodo): Promise<ContextoAcciones> {
  const periodMeses = mesesDePeriodo(mes, periodo);
  const mesesTTM = ttm(mes);
  const mesesPace = mesesPaceDesdeHoy();
  const mesesPaceLY = mesesPace.map((m) => sumarMeses(m, -12));
  const todos = Array.from(
    new Set([...periodMeses, ...mesesTTM, ...mesesPace, ...mesesPaceLY]),
  );

  const unidades = await getUnidades();
  const [map, fwd, ratings, celdas] = await Promise.all([
    unidadMesMap(unidades, todos),
    forwardKpis(unidades.map((u) => u.listingId)),
    ratingsPorUnidad(sumarDias(hoyMadrid(), -90)),
    costesUnidadCategoriaMes(mesesTTM),
  ]);
  const intel = await inteligenciaRevenue(unidades, map, mesesPace);

  const limpiezaCosteTTM = new Map<string, number>();
  for (const c of celdas) {
    if (c.categoria !== "limpieza_extra") continue;
    limpiezaCosteTTM.set(c.unidad, (limpiezaCosteTTM.get(c.unidad) ?? 0) + c.importe);
  }

  return {
    mes,
    periodMeses,
    mesesTTM,
    unidades,
    map,
    fwd,
    ratings,
    intel,
    limpiezaCosteTTM,
    seriePortfolioPeriodo: seriePnL(map, unidades, periodMeses),
    seriePortfolioTTM: seriePnL(map, unidades, mesesTTM),
  };
}

/** Datos derivados de una unidad (periodo + TTM + caja + cartera). */
export function datosUnidad(ctx: ContextoAcciones, u: UnidadInfo): DatosUnidad {
  const n = ctx.unidades.length;
  const r = sumar(itemsUnidad(ctx.map, u, ctx.periodMeses));
  const rTTM = sumar(itemsUnidad(ctx.map, u, ctx.mesesTTM));
  const cashPeriodo = seriePnLCash(
    seriePnL(ctx.map, [u], ctx.periodMeses),
    ctx.seriePortfolioPeriodo,
    [finDe(u)],
    n,
  );
  const cashTTM = seriePnLCash(
    seriePnL(ctx.map, [u], ctx.mesesTTM),
    ctx.seriePortfolioTTM,
    [finDe(u)],
    n,
  );
  const ventanas = ctx.fwd.porUnidad.get(u.listingId) ?? [];
  return {
    r,
    rTTM,
    cashPeriodo,
    cashTTM,
    nt: noiTTM(u, ctx.map, ctx.mesesTTM),
    v30: ventanas.find((v) => v.dias === 30),
    v15: ventanas.find((v) => v.dias === 15),
    rating: ctx.ratings.get(u.listingId),
    occBreakEven: breakEvenOcc({
      netos: rTTM.netos,
      costesVariables: rTTM.costesVariables,
      costesFijos: rTTM.costesFijos,
      vendidas: rTTM.vendidas,
      disponibles: rTTM.disponibles,
      overhead: cashTTM.reduce((s, m) => s + m.overhead, 0),
      servicioDeuda: cashTTM.reduce((s, m) => s + m.intereses + m.principal, 0),
    }),
    tieneDeuda:
      !!prestamoDeUnidad(u.displayName, u.nickname) ||
      !!(u.costeAdquisicion && u.costeAdquisicion > 0),
    costesPendientes: itemsUnidad(ctx.map, u, ctx.periodMeses).some((x) => x.costesPendientes),
    caja: cashPeriodo.reduce((s, m) => s + m.caja, 0),
    intel: ctx.intel.get(u.listingId),
  };
}

/** Acciones de maximo beneficio de una unidad. */
export function accionesDeUnidad(ctx: ContextoAcciones, u: UnidadInfo, d: DatosUnidad): AccionUnidad[] {
  const { rTTM } = d;
  return accionesUnidad({
    nombre: u.displayName,
    tipo: u.tipo,
    caja: d.caja,
    tieneDeuda: d.tieneDeuda,
    costesPendientes: d.costesPendientes,
    yieldPct: d.nt.yieldPct,
    margenPct: d.nt.margenPct,
    occBreakEven: d.occBreakEven,
    occTTM: ocupacionDe(rTTM),
    disponiblesTTM: rTTM.disponibles,
    margenNoche: rTTM.vendidas > 0 ? (rTTM.netos - rTTM.costesVariables) / rTTM.vendidas : null,
    adrTTM: adrDe(rTTM),
    revparTTM: revparDe(rTTM),
    brutosTTM: rTTM.brutos,
    comisionPct: rTTM.brutos > 0 ? rTTM.comisiones / rTTM.brutos : null,
    limpiezaIngresoTTM: rTTM.limpieza,
    limpiezaCosteTTM: ctx.limpiezaCosteTTM.get(u.nickname) ?? 0,
    otb15: d.v15
      ? { occ: d.v15.occ, occProy: d.v15.occProy, occLY: d.v15.occLY }
      : null,
    intel: d.intel ?? null,
    rating90: d.rating?.media ?? null,
    numReviews90: d.rating?.n ?? 0,
  });
}

/** Bandeja completa: revenue del portfolio + unidades + caja, ordenada por tono y euros. */
export async function generarAcciones(): Promise<CentroAcciones> {
  const mes = mesPorDefecto();
  const ctx = await cargarContexto(mes, "mes");
  const acciones: Accion[] = [];

  // 1) Revenue del portfolio (vision futura).
  const fwdInsights = generarInsightsForward(
    ctx.fwd.portfolio,
    ctx.unidades.map((u) => ({
      nombre: u.displayName,
      ventanas: ctx.fwd.porUnidad.get(u.listingId) ?? [],
    })),
  );
  for (const it of fwdInsights) {
    acciones.push({ ...it, area: "revenue", etiqueta: "Revenue", href: "/", impacto: null, palanca: null });
  }

  // 2) Acciones por unidad.
  for (const u of ctx.unidades) {
    const d = datosUnidad(ctx, u);
    for (const it of accionesDeUnidad(ctx, u, d)) {
      acciones.push({
        ...it,
        area: "unidad",
        etiqueta: u.displayName,
        href: `/unidad/${u.listingId}?mes=${mes}`,
      });
    }
  }

  // 3) Lectura del P&L de caja (portfolio, TTM).
  const n = ctx.unidades.length;
  const cashPortfolioTTM = seriePnLCash(
    ctx.seriePortfolioTTM,
    ctx.seriePortfolioTTM,
    ctx.unidades.map(finDe),
    n,
  );
  const totalTTM = cashPortfolioTTM.reduce(
    (a, m) => ({
      ing: a.ing + m.brutos,
      noi: a.noi + m.noi,
      overhead: a.overhead + m.overhead,
      intereses: a.intereses + m.intereses,
      principal: a.principal + m.principal,
      caja: a.caja + m.caja,
    }),
    { ing: 0, noi: 0, overhead: 0, intereses: 0, principal: 0, caja: 0 },
  );
  const equity = ctx.unidades.reduce(
    (s, u) => s + equityUnidad(u.costeAdquisicion, prestamoDeUnidad(u.displayName, u.nickname)),
    0,
  );
  for (const it of lecturaCaja(totalTTM, equity, false)) {
    acciones.push({
      ...it,
      area: "caja",
      etiqueta: "Caja",
      href: `/pnl?mes=${mes}&periodo=ttm`,
      impacto: null,
      palanca: null,
    });
  }

  acciones.sort((a, b) => {
    const t = ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono];
    if (t !== 0) return t;
    return (b.impacto ?? -1) - (a.impacto ?? -1);
  });

  return {
    mes,
    acciones,
    alertas: acciones.filter((a) => a.tono === "alerta").length,
    oportunidades: acciones.filter((a) => a.tono === "bueno").length,
    avisos: acciones.filter((a) => a.tono === "info").length,
    potencial: acciones
      .filter((a) => a.tono !== "info")
      .reduce((s, a) => s + (a.impacto ?? 0), 0),
  };
}
