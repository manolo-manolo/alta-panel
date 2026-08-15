// Consejos accionables sobre la web y la conversion a reserva.
// Puro y client-safe: no toca la BD ni APIs.

import type { Insight } from "@/lib/insights";

export interface PaginaApartamentoResumen {
  path: string;
  vistas: number;
}

export interface WebInsightInput {
  dias: number;
  // GA4 (null si no esta configurado)
  visitantes: number | null;
  visitantesPrev: number | null;
  fichasSinConversion: PaginaApartamentoResumen[]; // fichas top sin reserva directa
  canalTop: { nombre: string; cuota: number } | null; // cuota 0-1 de sesiones
  movilCuota: number | null; // 0-1
  eventosReserva: { nombre: string; conteo: number }[];
  // Reservas directas (siempre disponible, viene de Guesty)
  reservasDirectas: number;
  reservasDirectasPrev: number;
  revenueDirecto: number;
  // GSC (vacio si no esta configurado)
  gscPaginasBajoCtr: { url: string; impresiones: number; ctr: number }[];
}

const eur0 = (v: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(v);
const pct1 = (f: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(f * 100)}%`;
const num0 = (v: number) => new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(v);

export function generarInsightsWeb(i: WebInsightInput): Insight[] {
  const alertas: Insight[] = [];
  const buenas: Insight[] = [];
  const info: Insight[] = [];

  // 1) Evolucion de visitantes.
  if (i.visitantes !== null && i.visitantesPrev !== null && i.visitantesPrev > 20) {
    const v = (i.visitantes - i.visitantesPrev) / i.visitantesPrev;
    if (v <= -0.15) {
      alertas.push({
        tono: "alerta",
        texto: `Los visitantes caen un ${pct1(Math.abs(v))} vs los ${i.dias} dias anteriores (${num0(i.visitantes)} vs ${num0(i.visitantesPrev)}). Mira el desglose de fuentes para ver que canal se ha frenado.`,
      });
    } else if (v >= 0.15) {
      buenas.push({
        tono: "bueno",
        texto: `Los visitantes crecen un ${pct1(v)} vs los ${i.dias} dias anteriores (${num0(i.visitantes)} vs ${num0(i.visitantesPrev)}).`,
      });
    }
  }

  // 2) Conversion de visitas a reserva directa.
  if (i.visitantes !== null && i.visitantes > 50) {
    const conv = i.reservasDirectas / i.visitantes;
    if (i.reservasDirectas === 0) {
      alertas.push({
        tono: "alerta",
        texto: `${num0(i.visitantes)} visitantes en ${i.dias} dias y ninguna reserva directa. La web hace de escaparate pero no convierte: revisa que el motor de reserva funcione, que los precios esten alineados con las OTAs y que haya un boton de reserva visible en cada ficha.`,
      });
    } else if (conv < 0.005) {
      info.push({
        tono: "info",
        texto: `Conversion a reserva directa del ${pct1(conv)} (${num0(i.reservasDirectas)} reservas de ${num0(i.visitantes)} visitantes). Una web de reserva directa sana ronda el 1-3%: pequenas mejoras (precio igual o mejor que OTAs, resenas visibles, checkout en 2 pasos) tienen mucho recorrido.`,
      });
    } else {
      buenas.push({
        tono: "bueno",
        texto: `Conversion a reserva directa del ${pct1(conv)}: ${num0(i.reservasDirectas)} reservas (${eur0(i.revenueDirecto)}) de ${num0(i.visitantes)} visitantes en ${i.dias} dias. Cada reserva directa ahorra la comision del canal.`,
      });
    }
  }

  // 3) Fichas de apartamento con visitas pero sin reserva.
  if (i.fichasSinConversion.length > 0) {
    const top = i.fichasSinConversion.slice(0, 3);
    alertas.push({
      tono: "alerta",
      texto: `Fichas con visitas y cero reservas directas en ${i.dias} dias: ${top
        .map((p) => `${p.path} (${num0(p.vistas)} vistas)`)
        .join(", ")}. Compara su precio con Airbnb/Booking, revisa fotos y anade urgencia (fechas libres, "ultimas noches").`,
    });
  }

  // 4) Evolucion de reservas directas (siempre disponible).
  if (i.reservasDirectasPrev > 2) {
    const v = (i.reservasDirectas - i.reservasDirectasPrev) / i.reservasDirectasPrev;
    if (v <= -0.3) {
      alertas.push({
        tono: "alerta",
        texto: `Las reservas directas caen un ${pct1(Math.abs(v))} vs el periodo anterior (${num0(i.reservasDirectas)} vs ${num0(i.reservasDirectasPrev)}).`,
      });
    }
  }

  // 5) Seguimiento de clics hacia OTAs.
  const tieneEventoOTA = i.eventosReserva.some((e) =>
    /outbound|click_out|airbnb|booking/.test(e.nombre.toLowerCase()),
  );
  if (i.visitantes !== null && !tieneEventoOTA) {
    info.push({
      tono: "info",
      texto: `No hay ningun evento de clic hacia Airbnb/Booking en GA4, asi que no se puede medir cuantos visitantes acaban reservando alli. Anade un evento (p. ej. "click_out_ota") a los enlaces salientes y esta pestana lo recogera automaticamente.`,
    });
  }

  // 6) Dependencia de un solo canal de adquisicion.
  if (i.canalTop && i.canalTop.cuota >= 0.7) {
    info.push({
      tono: "info",
      texto: `El ${pct1(i.canalTop.cuota)} de las sesiones llega por ${i.canalTop.nombre}. Diversificar (email a huespedes pasados, fichas de Google Business, redes) reduce el riesgo de depender de un solo canal.`,
    });
  }

  // 7) SEO: paginas con muchas impresiones y CTR bajo.
  if (i.gscPaginasBajoCtr.length > 0) {
    const top = i.gscPaginasBajoCtr.slice(0, 2);
    info.push({
      tono: "info",
      texto: `Paginas que Google muestra mucho pero casi nadie clica: ${top
        .map((p) => `${p.url} (${num0(p.impresiones)} impresiones, CTR ${pct1(p.ctr)})`)
        .join(", ")}. Mejora titulo y descripcion (precio, zona, "licencia turistica") para ganar clics gratis.`,
    });
  }

  // 8) Movil.
  if (i.movilCuota !== null && i.movilCuota >= 0.6) {
    info.push({
      tono: "info",
      texto: `El ${pct1(i.movilCuota)} de los visitantes navega en movil: prueba el proceso de reserva completo desde un telefono, ahi es donde se pierde a la mayoria.`,
    });
  }

  return [...alertas, ...buenas, ...info].slice(0, 7);
}
