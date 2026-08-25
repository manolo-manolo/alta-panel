// Del NOI a la caja: deuda hipotecaria simulada y overhead corporativo.
// Puro y client-safe (solo usa los supuestos de config).

import { FINANCIACION } from "@/lib/config";
import type { PnLMes } from "@/lib/metrics";

export interface DeudaMes {
  saldoInicial: number; // saldo vivo al inicio del mes
  intereses: number;
  principal: number;
}

/** Meses completos entre el inicio (YYYY-MM-DD o YYYY-MM) y la clave de mes. */
export function mesesDesde(inicio: string, mes: string): number {
  const y0 = Number(inicio.slice(0, 4));
  const m0 = Number(inicio.slice(5, 7));
  const y = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return (y - y0) * 12 + (m - m0);
}

/**
 * Cuota del mes para un prestamo de `ltv x coste` con amortizacion lineal
 * (principal constante) a `anosAmortizacion` anos, interes sobre saldo vivo.
 * El prestamo arranca en el mes de `inicio` de la unidad.
 */
export function deudaMes(
  costeAdquisicion: number,
  inicio: string,
  mes: string,
): DeudaMes {
  const principalTotal = costeAdquisicion * FINANCIACION.ltv;
  const nMeses = FINANCIACION.anosAmortizacion * 12;
  const k = mesesDesde(inicio, mes);
  if (principalTotal <= 0 || k < 0) {
    return { saldoInicial: k < 0 ? principalTotal : 0, intereses: 0, principal: 0 };
  }
  if (k >= nMeses) return { saldoInicial: 0, intereses: 0, principal: 0 };
  const saldoInicial = principalTotal * (1 - k / nMeses);
  return {
    saldoInicial,
    intereses: (saldoInicial * FINANCIACION.interesAnual) / 12,
    principal: principalTotal / nMeses,
  };
}

export interface CashExtras {
  overhead: number;
  intereses: number;
  principal: number;
  caja: number; // NOI - overhead - intereses - principal
  saldoDeuda: number; // saldo vivo al cierre del mes (alcance)
}

export type PnLCashMes = PnLMes & CashExtras;

export interface UnidadFinanciacion {
  costeAdquisicion: number | null;
  /** Inicio de operacion (fecha_inicio o primera noche vendida). */
  inicio: string | null;
}

/**
 * Extiende una serie de P&L operativo hasta caja.
 * - `serie`: P&L del alcance (portfolio o una unidad), mes a mes.
 * - `seriePortfolio`: mismos meses con TODAS las unidades, para repartir el
 *   overhead por cuota de ingresos netos.
 * - `unidadesAlcance`: unidades del alcance, para la deuda.
 * - `numUnidades`: total de unidades del portfolio (reparto equitativo del
 *   overhead en meses sin ingresos).
 */
export function seriePnLCash(
  serie: PnLMes[],
  seriePortfolio: PnLMes[],
  unidadesAlcance: UnidadFinanciacion[],
  numUnidades: number,
): PnLCashMes[] {
  const overheadMensual = FINANCIACION.overheadAnualEur / 12;
  const portPorMes = new Map(seriePortfolio.map((p) => [p.mes, p]));
  return serie.map((m) => {
    const port = portPorMes.get(m.mes);
    let cuota: number;
    if (port && port.netos > 0) {
      cuota = Math.max(0, Math.min(1, m.netos / port.netos));
    } else {
      // Sin ingresos en el portfolio ese mes: reparto equitativo.
      cuota = numUnidades > 0 ? unidadesAlcance.length / numUnidades : 0;
    }
    const overhead = overheadMensual * cuota;

    let intereses = 0;
    let principal = 0;
    let saldoDeuda = 0;
    for (const u of unidadesAlcance) {
      if (!u.costeAdquisicion || u.costeAdquisicion <= 0 || !u.inicio) continue;
      const d = deudaMes(u.costeAdquisicion, u.inicio, m.mes);
      intereses += d.intereses;
      principal += d.principal;
      saldoDeuda += Math.max(0, d.saldoInicial - d.principal);
    }

    return {
      ...m,
      overhead,
      intereses,
      principal,
      caja: m.noi - overhead - intereses - principal,
      saldoDeuda,
    };
  });
}
