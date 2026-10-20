// Acciones de maximo beneficio por unidad, cuantificadas en euros y ordenadas
// por impacto. Puro y client-safe.
//
// Principios:
//  - La unidad de decision de precio es el MES futuro (pace vs STLY), no una
//    ventana generica.
//  - Solo se recomienda bajar precio cuando el precio es el problema (ADR OTB
//    por encima del ano pasado). Si no, la palanca es visibilidad.
//  - El last minute solo se dispara si la recogida tipica del ano pasado no
//    basta para cerrar la ventana.
//  - Cada accion lleva una estimacion de euros con supuestos explicitos
//    (abajo) para poder priorizar por dinero.

import type { Insight } from "@/lib/insights";
import type { IntelUnidad, MesPace } from "@/lib/revenue-intel";
import { mesLabel } from "@/lib/format";

export interface AccionUnidad extends Insight {
  impacto: number | null; // euros estimados (ventana o ano segun palanca)
  palanca: string; // precio | huecos | finde | lastminute | bloqueos | limpieza | canal | reviews | estructura | datos
}

export interface UnidadAccionInput {
  nombre: string;
  tipo: "propiedad" | "master_lease" | null;
  // Periodo seleccionado
  caja: number;
  tieneDeuda: boolean;
  costesPendientes: boolean;
  // Base TTM
  yieldPct: number | null;
  margenPct: number | null;
  occBreakEven: number | null;
  occTTM: number | null;
  disponiblesTTM: number;
  margenNoche: number | null; // (ingresos netos - costes variables) / noches vendidas
  adrTTM: number | null;
  revparTTM: number | null;
  brutosTTM: number;
  comisionPct: number | null; // comisiones / brutos
  limpiezaIngresoTTM: number;
  limpiezaCosteTTM: number;
  // Ventana de 15 dias (vision futura)
  otb15: { occ: number | null; occProy: number | null; occLY: number | null } | null;
  // Inteligencia de revenue (pace mensual e inventario diario)
  intel: IntelUnidad | null;
  // Reviews recientes
  rating90: number | null;
  numReviews90: number;
}

// Supuestos de impacto (conservadores):
const SUBIDA_PRECIO = 0.1; // subida recomendada sobre noches aun por vender
const FILL_RESTANTE = 0.6; // parte de las noches restantes que se venderan
const FILL_HUECO = 0.5; // parte de los huecos que se rellenan con min stay 1-2
const FILL_SEMANA = 0.25; // parte de noches entre semana que una oferta rellena
const FILL_LASTMINUTE = 0.4; // parte de noches a 15 dias que un descuento rellena
const DESCUENTO_MARGEN = 0.85; // margen por noche tras un descuento

const pct0 = (f: number) => `${Math.round(f * 100)}%`;
const eur0 = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);
const ORDEN_TONO: Record<Insight["tono"], number> = { alerta: 0, bueno: 1, info: 2 };

function accionesPrecioMes(m: MesPace, i: UnidadAccionInput, ratingBajo: boolean): AccionUnidad[] {
  const out: AccionUnidad[] = [];
  if (m.disponibles <= 0 || m.occ === null) return out;
  const adrRef = m.adr ?? m.adrLY ?? i.adrTTM;
  const margen = i.margenNoche ?? (adrRef !== null ? adrRef * 0.6 : null);
  const restantes = Math.max(0, m.disponibles - m.noches);
  const tieneSTLY = m.occSTLY !== null && (m.nochesSTLY >= 3 || m.nochesLY >= 10);
  const diff = tieneSTLY ? m.occ - (m.occSTLY as number) : null;
  const etiquetaMes = mesLabel(m.mes);

  // Infraprecio: muy por delante del ritmo del ano pasado (o muy lleno sin historico).
  // Con rating reciente bajo no se recomienda subir: primero recuperar el producto.
  const adelantado = (diff !== null && diff >= 0.1) || (!tieneSTLY && m.occ >= 0.75 && m.diasHasta >= 20);
  if (adelantado && restantes > 0 && adrRef !== null && !ratingBajo) {
    const extra = restantes * FILL_RESTANTE;
    const impacto = extra * adrRef * SUBIDA_PRECIO;
    const caro = m.adrLY !== null && (m.adr ?? 0) >= m.adrLY * 1.15;
    out.push({
      tono: caro ? "info" : "bueno",
      palanca: "precio",
      impacto,
      texto: caro
        ? `${etiquetaMes}: vas al ${pct0(m.occ)} reservado${diff !== null ? ` (${Math.round(diff * 100)} pts mas que el ano pasado)` : ""} pero el ADR ya es un ${pct0((m.adr! - m.adrLY!) / m.adrLY!)} mas alto que entonces. Sube solo un 5% en fechas sueltas y vigila la recogida.`
        : `Sube las tarifas de ${etiquetaMes} un 10-15%: ya vas al ${pct0(m.occ)} reservado${diff !== null ? ` vs ${pct0(m.occSTLY as number)} a estas alturas el ano pasado (cerro al ${m.occLY !== null ? pct0(m.occLY) : "n/d"})` : ""}. Quedan ${restantes} noches; cada +10% en ellas ≈ ${eur0(impacto)}.`,
    });
  }

  // Retraso: muy por detras del ritmo y con tiempo para reaccionar.
  const atrasado = diff !== null && diff <= -0.1 && (m.occSTLY as number) >= 0.15 && m.diasHasta <= 75;
  if (atrasado && margen !== null) {
    const objetivo = Math.max(m.occLY ?? 0, m.occSTLY as number);
    const nochesGap = Math.max(0, objetivo * m.disponibles - m.noches);
    const precioAlto = m.adrLY !== null && m.adr !== null && m.adr >= m.adrLY * 1.08;
    if (precioAlto) {
      out.push({
        tono: "alerta",
        palanca: "precio",
        impacto: nochesGap * margen * DESCUENTO_MARGEN,
        texto: `Baja las tarifas de ${etiquetaMes} un 8-10%: vas al ${pct0(m.occ)} vs ${pct0(m.occSTLY as number)} el ano pasado a estas alturas y el ADR (${eur0(m.adr!)}) esta un ${pct0((m.adr! - m.adrLY!) / m.adrLY!)} por encima del de entonces (${eur0(m.adrLY!)}). El precio esta frenando: ${Math.round(nochesGap)} noches en juego ≈ ${eur0(nochesGap * margen * DESCUENTO_MARGEN)}.`,
      });
    } else {
      const impacto = nochesGap * margen * 0.5;
      out.push({
        tono: "alerta",
        palanca: "visibilidad",
        impacto,
        texto: `${etiquetaMes} va ${Math.abs(Math.round((diff as number) * 100))} pts por detras del ano pasado (${pct0(m.occ)} vs ${pct0(m.occSTLY as number)}) y NO es precio (ADR en linea). Toca visibilidad: fotos y titulo, estancia minima, promocion en Airbnb/Booking y respuesta rapida. ${Math.round(nochesGap)} noches en juego ≈ ${eur0(impacto)} recuperables.`,
      });
    }
  }
  return out;
}

/** Hasta 4 acciones por unidad, alertas primero y dentro de cada tono por euros. */
export function accionesUnidad(i: UnidadAccionInput): AccionUnidad[] {
  const out: AccionUnidad[] = [];
  const margen = i.margenNoche ?? (i.adrTTM !== null ? i.adrTTM * 0.6 : null);
  const ratingBajo = i.rating90 !== null && i.numReviews90 >= 2 && i.rating90 < 4.6;

  // 1) Precio por mes futuro.
  if (i.intel) {
    for (const m of i.intel.mesesPace) out.push(...accionesPrecioMes(m, i, ratingBajo));
  }

  // 2) Huecos de 1-2 noches en 30 dias.
  if (i.intel && i.intel.huecos30 >= 2 && margen !== null) {
    const impacto = i.intel.huecos30 * margen * FILL_HUECO;
    out.push({
      tono: "bueno",
      palanca: "huecos",
      impacto,
      texto: `${i.intel.huecos30} noches en huecos de 1-2 dias entre reservas en los proximos 30 dias. Relaja la estancia minima a 1 noche en esos huecos y ponles precio de hueco (−10%): ≈ ${eur0(impacto)} que hoy se pierden.`,
    });
  }

  // 3) Fin de semana vs entre semana (60 dias).
  if (i.intel && i.intel.finde.disponibles >= 8 && i.intel.semana.disponibles >= 15 && margen !== null) {
    const occF = i.intel.finde.vendidas / i.intel.finde.disponibles;
    const occS = i.intel.semana.vendidas / i.intel.semana.disponibles;
    const libresF = i.intel.finde.disponibles - i.intel.finde.vendidas;
    const libresS = i.intel.semana.disponibles - i.intel.semana.vendidas;
    if (occF >= 0.8 && occS <= 0.5) {
      const impacto =
        libresF * (i.adrTTM ?? 0) * 0.12 + libresS * margen * FILL_SEMANA;
      out.push({
        tono: "bueno",
        palanca: "finde",
        impacto,
        texto: `Findes al ${pct0(occF)} y entre semana al ${pct0(occS)} en 60 dias: sube viernes y sabado un 10-15% y lanza oferta de 3+ noches o descuento semanal para rellenar ${libresS} noches entre semana. ≈ ${eur0(impacto)}.`,
      });
    } else if (occS >= 0.75 && occF <= 0.5) {
      out.push({
        tono: "bueno",
        palanca: "finde",
        impacto: libresF * margen * FILL_SEMANA,
        texto: `Entre semana al ${pct0(occS)} pero findes solo al ${pct0(occF)}: revisa el precio de viernes y sabado (suele estar por encima de mercado) y el minimo de 2 noches en finde.`,
      });
    }
  }

  // 4) Last minute solo si la recogida tipica no cierra la ventana.
  if (i.otb15 && i.intel && margen !== null) {
    const { occProy, occLY } = i.otb15;
    if (occProy !== null && occLY !== null && occProy < occLY - 0.08 && i.intel.libres15 >= 3) {
      const impacto = i.intel.libres15 * margen * FILL_LASTMINUTE;
      out.push({
        tono: "alerta",
        palanca: "lastminute",
        impacto,
        texto: `A 15 dias la proyeccion (${pct0(occProy)}) no llega al cierre del ano pasado (${pct0(occLY)}) ni con la recogida tipica: descuento last minute escalonado (−10% a 7 dias, −20% a 3) en ${i.intel.libres15} noches sin vender ≈ ${eur0(impacto)}.`,
      });
    }
  }

  // 5) Bloqueos que comen inventario (60 dias).
  if (i.intel && i.intel.bloqueadas60 >= 4 && i.revparTTM !== null) {
    const impacto = i.intel.bloqueadas60 * i.revparTTM;
    out.push({
      tono: "info",
      palanca: "bloqueos",
      impacto,
      texto: `${i.intel.bloqueadas60} noches bloqueadas en los proximos 60 dias ≈ ${eur0(impacto)} de RevPAR que no se puede vender. Confirma que cada bloqueo sigue siendo necesario.`,
    });
  }

  // 6) Limpieza deficitaria (TTM).
  if (i.limpiezaCosteTTM > 0 && i.limpiezaCosteTTM > i.limpiezaIngresoTTM * 1.05) {
    const deficit = i.limpiezaCosteTTM - i.limpiezaIngresoTTM;
    out.push({
      tono: "alerta",
      palanca: "limpieza",
      impacto: deficit,
      texto: `La limpieza pierde ${eur0(deficit)} al ano: pagas ${eur0(i.limpiezaCosteTTM)} y cobras ${eur0(i.limpiezaIngresoTTM)}. Sube la tarifa de limpieza al huesped (o el minimo de noches) hasta cubrir el coste; es el euro mas facil de recuperar.`,
    });
  }

  // 7) Fuga por comisiones de canal.
  if (i.comisionPct !== null && i.comisionPct >= 0.14 && i.brutosTTM > 5000) {
    const impacto = i.brutosTTM * 0.1 * i.comisionPct;
    out.push({
      tono: "info",
      palanca: "canal",
      impacto,
      texto: `Comisiones del ${pct0(i.comisionPct)} sobre ingresos: cada 10 puntos de reservas que pasen a directo (repetidores, web, codigo de descuento directo) valen ≈ ${eur0(impacto)} al ano.`,
    });
  }

  // 8) Reviews recientes.
  if (ratingBajo) {
    out.push({
      tono: "alerta",
      palanca: "reviews",
      impacto: null,
      texto: `Rating de ${i.rating90!.toFixed(2)} en 90 dias (${i.numReviews90} reviews): no subas precio hasta recuperarlo. Lee las reviews, corrige la causa y pide valoracion a los proximos huespedes contentos.`,
    });
  } else if (i.rating90 !== null && i.numReviews90 >= 3 && i.rating90 >= 4.9) {
    out.push({
      tono: "bueno",
      palanca: "reviews",
      impacto: null,
      texto: `Rating de ${i.rating90.toFixed(2)} en 90 dias: producto redondo, apoya las subidas de precio recomendadas.`,
    });
  }

  // 9) Estructura: equilibrio de caja.
  if (
    i.occBreakEven !== null &&
    i.occTTM !== null &&
    i.occTTM < i.occBreakEven - 0.02 &&
    margen !== null
  ) {
    const impacto = (i.occBreakEven - i.occTTM) * i.disponiblesTTM * margen;
    out.push({
      tono: "alerta",
      palanca: "estructura",
      impacto,
      texto: `Por debajo del punto de equilibrio de caja: necesita ${pct0(i.occBreakEven)} de ocupacion para cubrir fijos, overhead y deuda, y lleva ${pct0(i.occTTM)} en 12 meses (brecha ≈ ${eur0(impacto)}/ano). O sube RevPAR o baja estructura.`,
    });
  } else if (i.caja < -50 && i.tieneDeuda) {
    out.push({
      tono: "alerta",
      palanca: "estructura",
      impacto: null,
      texto: `Caja negativa en el periodo (${eur0(i.caja)}): el NOI no cubre overhead y servicio de deuda.`,
    });
  }

  // 10) Rendimiento fuera de banda (solo informativo, la palanca ya esta arriba).
  if (i.tipo === "propiedad" && i.yieldPct !== null && i.yieldPct < 7) {
    out.push({
      tono: "info",
      palanca: "estructura",
      impacto: null,
      texto: `Yield TTM del ${i.yieldPct.toFixed(1).replace(".", ",")}% sobre inversion, por debajo de la banda objetivo (9-11%).`,
    });
  }
  if (i.tipo === "master_lease" && i.margenPct !== null && i.margenPct < 15) {
    out.push({
      tono: "info",
      palanca: "estructura",
      impacto: null,
      texto: `Margen NOI TTM del ${i.margenPct.toFixed(1).replace(".", ",")}%: poco colchon sobre la renta.`,
    });
  }

  if (i.costesPendientes) {
    out.push({
      tono: "info",
      palanca: "datos",
      impacto: null,
      texto: "Costes del mes sin cargar: NOI y caja sobrestimados hasta subir el Excel de gastos.",
    });
  }

  out.sort((a, b) => {
    const t = ORDEN_TONO[a.tono] - ORDEN_TONO[b.tono];
    if (t !== 0) return t;
    return (b.impacto ?? -1) - (a.impacto ?? -1);
  });
  return out.slice(0, 4);
}
