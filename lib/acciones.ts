import "server-only";

// Centro de acciones: agrega en una sola lista priorizada los consejos de
// revenue (portfolio), las acciones por unidad y la lectura del P&L de caja,
// siempre sobre el mes actual y los ultimos 12 meses. Los consejos de costes
// y de la web viven en sus paginas (mas contexto alli); /acciones enlaza.

import type { Insight } from "@/lib/insights";
import { generarInsightsForward } from "@/lib/forward-insights";
import { accionesUnidad } from "@/lib/unit-actions";
import { forwardKpis } from "@/lib/forward";
import {
  seriePnLCash,
  prestamoDeUnidad,
  equityUnidad,
  breakEvenOcc,
  lecturaCaja,
  type UnidadFinanciacion,
} from "@/lib/finance";
import { hoyMadrid, sumarDias } from "@/lib/time";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  ocupacionDe,
  seriePnL,
  noiTTM,
  ratingsPorUnidad,
  ttm,
  mesPorDefecto,
  type UnidadInfo,
  type UnidadMes,
} from "@/lib/metrics";

export type AreaAccion = "revenue" | "unidad" | "caja";

export interface Accion extends Insight {
  area: AreaAccion;
  /** Etiqueta corta (nombre de unidad o area). */
  etiqueta: string;
  href: string;
}

export interface CentroAcciones {
  mes: string;
  acciones: Accion[];
  alertas: number;
  oportunidades: number;
  avisos: number;
}

const ORDEN_TONO: Record<Insight["tono"], number> = { alerta: 0, bueno: 1, info: 2 };

export async function generarAcciones(): Promise<CentroAcciones> {
  const mes = mesPorDefecto();
  const mesesTTM = ttm(mes);
  const todos = Array.from(new Set([mes, ...mesesTTM]));

  const unidades = await getUnidades();
  const [map, fwd, ratings] = await Promise.all([
    unidadMesMap(unidades, todos),
    forwardKpis(unidades.map((u) => u.listingId)),
    ratingsPorUnidad(sumarDias(hoyMadrid(), -90)),
  ]);

  const itemsUnidad = (u: UnidadInfo, meses: string[]): UnidadMes[] =>
    meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);
  const finDe = (u: UnidadInfo): UnidadFinanciacion => ({
    costeAdquisicion: u.costeAdquisicion,
    inicio: u.fechaInicio ?? u.primeraNoche,
    nombre: u.displayName,
    nickname: u.nickname,
  });

  const serieMes = seriePnL(map, unidades, [mes]);
  const serieTTM = seriePnL(map, unidades, mesesTTM);
  const occPortfolio = ocupacionDe(sumar(unidades.flatMap((u) => itemsUnidad(u, [mes]))));

  const acciones: Accion[] = [];

  // 1) Revenue del portfolio (vision futura).
  const fwdInsights = generarInsightsForward(
    fwd.portfolio,
    unidades.map((u) => ({
      nombre: u.displayName,
      ventanas: fwd.porUnidad.get(u.listingId) ?? [],
    })),
  );
  for (const it of fwdInsights) {
    acciones.push({ ...it, area: "revenue", etiqueta: "Revenue", href: "/" });
  }

  // 2) Acciones por unidad.
  for (const u of unidades) {
    const r = sumar(itemsUnidad(u, [mes]));
    const rTTM = sumar(itemsUnidad(u, mesesTTM));
    const cashMes = seriePnLCash(seriePnL(map, [u], [mes]), serieMes, [finDe(u)], unidades.length);
    const cashTTM = seriePnLCash(seriePnL(map, [u], mesesTTM), serieTTM, [finDe(u)], unidades.length);
    const nt = noiTTM(u, map, mesesTTM);
    const v30 = (fwd.porUnidad.get(u.listingId) ?? []).find((v) => v.dias === 30);
    const rating = ratings.get(u.listingId);
    const occBE = breakEvenOcc({
      netos: rTTM.netos,
      costesVariables: rTTM.costesVariables,
      costesFijos: rTTM.costesFijos,
      vendidas: rTTM.vendidas,
      disponibles: rTTM.disponibles,
      overhead: cashTTM.reduce((s, m) => s + m.overhead, 0),
      servicioDeuda: cashTTM.reduce((s, m) => s + m.intereses + m.principal, 0),
    });
    const lista = accionesUnidad({
      nombre: u.displayName,
      tipo: u.tipo,
      occ: ocupacionDe(r),
      occPortfolio,
      caja: cashMes.reduce((s, m) => s + m.caja, 0),
      tieneDeuda:
        !!prestamoDeUnidad(u.displayName, u.nickname) ||
        !!(u.costeAdquisicion && u.costeAdquisicion > 0),
      costesPendientes: itemsUnidad(u, [mes]).some((x) => x.costesPendientes),
      yieldPct: nt.yieldPct,
      margenPct: nt.margenPct,
      occBreakEven: occBE,
      occTTM: ocupacionDe(rTTM),
      otbOcc: v30?.occ ?? null,
      otbOccSTLY: v30?.occSTLY ?? null,
      otbAdr: v30?.adr ?? null,
      otbAdrSTLY: v30?.adrSTLY ?? null,
      otbNoches: v30?.noches ?? 0,
      otbDisponibles: v30?.disponibles ?? 0,
      rating90: rating?.media ?? null,
      numReviews90: rating?.n ?? 0,
    });
    for (const it of lista) {
      acciones.push({
        ...it,
        area: "unidad",
        etiqueta: u.displayName,
        href: `/unidad/${u.listingId}?mes=${mes}`,
      });
    }
  }

  // 3) Lectura del P&L de caja (portfolio, TTM).
  const cashPortfolioTTM = seriePnLCash(serieTTM, serieTTM, unidades.map(finDe), unidades.length);
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
  const equity = unidades.reduce(
    (s, u) => s + equityUnidad(u.costeAdquisicion, prestamoDeUnidad(u.displayName, u.nickname)),
    0,
  );
  for (const it of lecturaCaja(totalTTM, equity, false)) {
    acciones.push({ ...it, area: "caja", etiqueta: "Caja", href: `/pnl?mes=${mes}&periodo=ttm` });
  }

  acciones.sort((a, b) => ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono]);

  return {
    mes,
    acciones,
    alertas: acciones.filter((a) => a.tono === "alerta").length,
    oportunidades: acciones.filter((a) => a.tono === "bueno").length,
    avisos: acciones.filter((a) => a.tono === "info").length,
  };
}
