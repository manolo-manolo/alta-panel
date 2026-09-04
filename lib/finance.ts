// Del NOI a la caja: deuda real por prestamo (lib/debt-data.ts) con la
// simulacion LTV como respaldo para unidades sin prestamo casado, mas el
// overhead corporativo. Puro y client-safe.

import { FINANCIACION } from "@/lib/config";
import { PRESTAMOS, type PrestamoReal } from "@/lib/debt-data";
import { sumarMeses } from "@/lib/time";
import type { PnLMes } from "@/lib/metrics";

// --- Prestamos reales (sistema frances: cuota fija) ---

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prestamo real de una unidad, casando por nombre visible o nickname. */
export function prestamoDeUnidad(
  nombre: string | null,
  nickname: string | null,
): PrestamoReal | null {
  const candidatos = [nombre, nickname]
    .filter((x): x is string => !!x)
    .map(normalizar);
  const compactos = candidatos.map((c) => c.replace(/\s+/g, ""));
  for (const p of PRESTAMOS) {
    for (const clave of p.claves) {
      const claveCompacta = clave.replace(/\s+/g, "");
      if (
        candidatos.some((c) => c.includes(clave)) ||
        compactos.some((c) => c.includes(claveCompacta))
      ) {
        return p;
      }
    }
  }
  return null;
}

interface CuotaMes {
  intereses: number;
  principal: number;
  saldoCierre: number;
}

// Calendario completo por prestamo, calculado una vez y cacheado.
const schedules = new Map<string, Map<string, CuotaMes>>();

function scheduleDeuda(p: PrestamoReal): Map<string, CuotaMes> {
  const hit = schedules.get(p.nombre);
  if (hit) return hit;
  const out = new Map<string, CuotaMes>();
  const r = p.interesAnual / 12;

  if (p.inicioMes) {
    // Inicio conocido: rodar hacia delante desde el importe inicial, con
    // carencia (solo intereses) los primeros meses.
    let saldo = p.importeInicial;
    let mes = p.inicioMes;
    const carencia = p.carenciaMeses ?? 0;
    for (let i = 0; i < 600 && saldo > 0.01; i++) {
      const intereses = saldo * r;
      const principal = i < carencia ? 0 : Math.max(0, Math.min(p.pagoMensual - intereses, saldo));
      out.set(mes, { intereses, principal, saldoCierre: saldo - principal });
      saldo -= principal;
      mes = sumarMeses(mes, 1);
    }
  } else {
    // Sin fecha de inicio: reconstruir hacia atras desde el saldo de
    // referencia (el saldo de apertura nunca supera el importe inicial) y
    // rodar hacia delante desde el mismo punto.
    let saldoOpen = p.saldoRef; // apertura de mesRef+1
    let mes = sumarMeses(p.mesRef, 1);
    for (let i = 0; i < 600 && saldoOpen > 0.01; i++) {
      const intereses = saldoOpen * r;
      const principal = Math.max(0, Math.min(p.pagoMensual - intereses, saldoOpen));
      out.set(mes, { intereses, principal, saldoCierre: saldoOpen - principal });
      saldoOpen -= principal;
      mes = sumarMeses(mes, 1);
    }
    let saldoCierre = p.saldoRef; // cierre de mesRef
    let mesAtras = p.mesRef;
    for (let i = 0; i < 600; i++) {
      const saldoApertura = (saldoCierre + p.pagoMensual) / (1 + r);
      if (saldoApertura > p.importeInicial + 0.5) break; // antes del inicio
      out.set(mesAtras, {
        intereses: saldoApertura * r,
        principal: saldoApertura - saldoCierre,
        saldoCierre,
      });
      saldoCierre = saldoApertura;
      mesAtras = sumarMeses(mesAtras, -1);
    }
  }
  schedules.set(p.nombre, out);
  return out;
}

/** Cuota real (intereses/principal/saldo) de un prestamo en un mes. */
export function deudaRealMes(p: PrestamoReal, mes: string): CuotaMes {
  return scheduleDeuda(p).get(mes) ?? { intereses: 0, principal: 0, saldoCierre: 0 };
}

/** Equity invertido en una unidad: coste menos el prestamo real (o el LTV supuesto). */
export function equityUnidad(
  costeAdquisicion: number | null,
  prestamo: PrestamoReal | null,
): number {
  if (!costeAdquisicion || costeAdquisicion <= 0) return 0;
  const deuda = prestamo ? prestamo.importeInicial : costeAdquisicion * FINANCIACION.ltv;
  return Math.max(0, costeAdquisicion - deuda);
}

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
  /** Nombres para casar el prestamo real (display name y nickname). */
  nombre?: string | null;
  nickname?: string | null;
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
      // Prestamo real si existe (independiente del coste de adquisicion).
      const prestamo = prestamoDeUnidad(u.nombre ?? null, u.nickname ?? null);
      if (prestamo) {
        const d = deudaRealMes(prestamo, m.mes);
        intereses += d.intereses;
        principal += d.principal;
        saldoDeuda += d.saldoCierre;
        continue;
      }
      // Respaldo: simulacion LTV para unidades con coste sin prestamo casado.
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
