// Acciones sugeridas por unidad: precio, reviews, caja y visibilidad.
// Puro y client-safe.

import type { Insight } from "@/lib/insights";

export interface UnidadAccionInput {
  nombre: string;
  tipo: "propiedad" | "master_lease" | null;
  // Periodo seleccionado
  occ: number | null;
  occPortfolio: number | null;
  caja: number;
  tieneDeuda: boolean;
  costesPendientes: boolean;
  // Rendimiento TTM
  yieldPct: number | null; // propiedad
  margenPct: number | null; // master lease
  // Cartera a 30 dias (on the books)
  otbOcc: number | null;
  otbOccSTLY: number | null;
  otbAdr: number | null;
  otbAdrSTLY: number | null;
  otbNoches: number;
  otbDisponibles: number;
  // Reviews recientes (90 dias)
  rating90: number | null;
  numReviews90: number;
}

const pct0 = (f: number) => `${Math.round(f * 100)}%`;
const eur0 = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);

/** 2-3 acciones concretas por unidad, alertas primero. */
export function accionesUnidad(i: UnidadAccionInput): Insight[] {
  const alertas: Insight[] = [];
  const buenas: Insight[] = [];
  const info: Insight[] = [];

  // Precio segun cartera a 30 dias.
  if (i.otbDisponibles > 0 && i.otbOcc !== null) {
    const diff = i.otbOccSTLY !== null && i.otbOccSTLY > 0 ? i.otbOcc - i.otbOccSTLY : null;
    if (i.otbNoches === 0) {
      alertas.push({
        tono: "alerta",
        texto: "Sin ninguna reserva en los proximos 30 dias: baja ADR, relaja la estancia minima y comprueba que el anuncio este activo en todos los canales.",
      });
    } else if (i.otbOcc >= 0.85 || (diff !== null && diff >= 0.1)) {
      buenas.push({
        tono: "bueno",
        texto: `Sube ADR: cartera a 30 dias fuerte (${pct0(i.otbOcc)} OTB${diff !== null ? `, ${Math.round(diff * 100)} pts mas que el ano pasado` : ""}). Quedan ${i.otbDisponibles - i.otbNoches} noches por vender: no las regales.`,
      });
    } else if (i.otbOcc <= 0.35 || (diff !== null && diff <= -0.1)) {
      const precioAlto =
        i.otbAdr !== null && i.otbAdrSTLY !== null && i.otbAdr > i.otbAdrSTLY * 1.08;
      alertas.push({
        tono: "alerta",
        texto: `Baja ADR o promociona: cartera a 30 dias floja (${pct0(i.otbOcc)} OTB${diff !== null ? `, ${Math.abs(Math.round(diff * 100))} pts menos que el ano pasado` : ""})${precioAlto ? `; el ADR OTB (${eur0(i.otbAdr!)}) va por encima del ritmo del ano pasado (${eur0(i.otbAdrSTLY!)}), el precio puede estar frenando` : ""}.`,
      });
    }
  }

  // Reviews recientes.
  if (i.rating90 !== null && i.numReviews90 >= 2 && i.rating90 < 4.6) {
    alertas.push({
      tono: "alerta",
      texto: `Revisa las reviews: media de ${i.rating90.toFixed(2)} en 90 dias (${i.numReviews90} reviews). Un rating bajo hunde el ranking y obliga a competir por precio.`,
    });
  } else if (i.rating90 !== null && i.numReviews90 >= 3 && i.rating90 >= 4.9) {
    buenas.push({
      tono: "bueno",
      texto: `Rating de ${i.rating90.toFixed(2)} en 90 dias: producto redondo, apoya subidas de precio.`,
    });
  }

  // Caja del periodo.
  if (i.caja < -50 && i.tieneDeuda) {
    alertas.push({
      tono: "alerta",
      texto: `Caja negativa en el periodo (${eur0(i.caja)}): el NOI no cubre overhead y servicio de deuda.`,
    });
  }

  // Rendimiento TTM fuera de banda.
  if (i.tipo === "propiedad" && i.yieldPct !== null && i.yieldPct < 7) {
    alertas.push({
      tono: "alerta",
      texto: `Yield TTM del ${i.yieldPct.toFixed(1).replace(".", ",")}% sobre inversion, por debajo de la banda objetivo (9-11%).`,
    });
  }
  if (i.tipo === "master_lease" && i.margenPct !== null && i.margenPct < 15) {
    alertas.push({
      tono: "alerta",
      texto: `Margen NOI TTM del ${i.margenPct.toFixed(1).replace(".", ",")}%: poco colchon sobre la renta.`,
    });
  }

  // Ocupacion del periodo vs portfolio.
  if (
    i.occ !== null &&
    i.occPortfolio !== null &&
    i.occPortfolio > 0 &&
    i.occ < i.occPortfolio * 0.7
  ) {
    alertas.push({
      tono: "alerta",
      texto: `Ocupacion del ${pct0(i.occ)} vs ${pct0(i.occPortfolio)} de media del portfolio: revisa precio, fotos y posicionamiento del anuncio.`,
    });
  }

  if (i.costesPendientes) {
    info.push({
      tono: "info",
      texto: "Costes del mes sin cargar: NOI y caja sobrestimados hasta subir el Excel de gastos.",
    });
  }

  return [...alertas, ...buenas, ...info].slice(0, 3);
}
