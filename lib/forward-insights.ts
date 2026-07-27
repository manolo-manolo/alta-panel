// Consejos accionables de revenue management a partir de las ventanas
// forward (on the books). Puro y client-safe: no toca la BD.

import type { Insight } from "@/lib/insights";

export interface VentanaResumen {
  dias: number;
  noches: number;
  revenue: number;
  disponibles: number;
  bloqueadas: number;
  occ: number | null;
  adr: number | null;
  nochesSTLY: number;
  occSTLY: number | null;
  adrSTLY: number | null;
  nochesLY: number;
  occLY: number | null;
  adrLY: number | null;
  occProy: number | null;
  revenueProy: number;
}

export interface UnidadForwardResumen {
  nombre: string;
  ventanas: VentanaResumen[];
}

const eur0 = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);
const pct0 = (f: number) => `${Math.round(f * 100)}%`;
const pts = (f: number) => {
  const v = Math.round(Math.abs(f) * 100);
  return `${v} punto${v === 1 ? "" : "s"}`;
};

function ventana(vs: VentanaResumen[], dias: number): VentanaResumen | undefined {
  return vs.find((v) => v.dias === dias);
}

/**
 * Genera consejos de revenue para el portfolio (o para una unidad si
 * `unidades` va vacio y `portfolio` son las ventanas de esa unidad).
 */
export function generarInsightsForward(
  portfolio: VentanaResumen[],
  unidades: UnidadForwardResumen[],
): Insight[] {
  const alertas: Insight[] = [];
  const buenas: Insight[] = [];
  const info: Insight[] = [];
  const esUnidad = unidades.length === 0;
  const sujeto = esUnidad ? "esta unidad" : "el portfolio";

  const v15 = ventana(portfolio, 15);
  const v30 = ventana(portfolio, 30);
  const v90 = ventana(portfolio, 90);

  // 1) Ritmo a 30 dias vs mismo punto del ano pasado (pace).
  if (v30 && v30.occ !== null && v30.occSTLY !== null && v30.occSTLY > 0) {
    const diff = v30.occ - v30.occSTLY;
    if (diff <= -0.05) {
      const pickupLY = Math.max(0, v30.nochesLY - v30.nochesSTLY);
      alertas.push({
        tono: "alerta",
        texto: `Ritmo a 30 dias por detras del ano pasado: ${pct0(v30.occ)} OTB vs ${pct0(v30.occSTLY)} en el mismo punto (${pts(diff)} menos). El ano pasado esa ventana cerro al ${v30.occLY !== null ? pct0(v30.occLY) : "n/d"} con ${pickupLY} noches de recogida tardia. Revisa precios, estancia minima y promociones para no depender solo de la ultima hora.`,
      });
    } else if (diff >= 0.05) {
      buenas.push({
        tono: "bueno",
        texto: `Ritmo a 30 dias por delante del ano pasado: ${pct0(v30.occ)} OTB vs ${pct0(v30.occSTLY)} en el mismo punto (${pts(diff)} mas).`,
      });
    }
  }

  // 2) Equilibrio precio/ocupacion a 30 dias.
  if (
    v30 &&
    v30.adr !== null &&
    v30.adrSTLY !== null &&
    v30.occ !== null &&
    v30.occSTLY !== null &&
    v30.occSTLY > 0
  ) {
    const adrDiff = (v30.adr - v30.adrSTLY) / v30.adrSTLY;
    const occDiff = v30.occ - v30.occSTLY;
    if (adrDiff >= 0.1 && occDiff <= -0.05) {
      alertas.push({
        tono: "alerta",
        texto: `El ADR a 30 dias va ${pct0(adrDiff)} por encima del ano pasado (${eur0(v30.adr)} vs ${eur0(v30.adrSTLY)}) pero la ocupacion va por detras: el precio puede estar frenando la demanda. Prueba bajadas selectivas en fechas con poca cartera.`,
      });
    } else if (adrDiff <= -0.05 && occDiff >= 0.05) {
      info.push({
        tono: "info",
        texto: `Se esta vendiendo mas barato que el ano pasado a 30 dias (ADR ${eur0(v30.adr)} vs ${eur0(v30.adrSTLY)}) con la ocupacion por delante: hay margen para subir tarifas en las fechas que quedan libres.`,
      });
    }
  }

  // 3) Urgencia a 15 dias: noches sin vender y su valor.
  if (v15 && v15.disponibles > 0) {
    const libres = Math.max(0, v15.disponibles - v15.noches);
    const occ15 = v15.occ ?? 0;
    if (occ15 < 0.55 && libres > 0) {
      const valor = v15.adr !== null ? ` (~${eur0(libres * v15.adr)} al ADR actual)` : "";
      alertas.push({
        tono: "alerta",
        texto: `Ventana critica: ${sujeto} tiene ${libres} noche${libres === 1 ? "" : "s"} sin vender en los proximos 15 dias con ocupacion OTB del ${pct0(occ15)}${valor}. Activa descuentos last minute (10-15%), relaja la estancia minima y revisa la visibilidad en canales.`,
      });
    }
  }

  // 4) Demanda adelantada fuerte a 90 dias: oportunidad de subir precio.
  if (v90 && v90.occ !== null && v90.occSTLY !== null && v90.occSTLY > 0) {
    const diff = v90.occ - v90.occSTLY;
    if (diff >= 0.08) {
      buenas.push({
        tono: "bueno",
        texto: `Demanda adelantada fuerte: a 90 dias la ocupacion OTB (${pct0(v90.occ)}) va ${pts(diff)} por encima del mismo punto del ano pasado. Sube tarifas en los picos de demanda antes de quedarte sin inventario barato.`,
      });
    }
  }

  // 5) Unidades sin cartera a 30 dias.
  if (!esUnidad) {
    const vacias = unidades.filter((u) => {
      const v = ventana(u.ventanas, 30);
      return v && v.disponibles > 0 && v.noches === 0;
    });
    if (vacias.length) {
      alertas.push({
        tono: "alerta",
        texto: `Sin reservas en los proximos 30 dias: ${vacias.map((u) => u.nombre).join(", ")}. Revisa precio, fotos, minimos y que el anuncio este activo en todos los canales.`,
      });
    }

    // 6) Unidades muy por debajo de la ocupacion media OTB a 30 dias.
    if (v30 && v30.occ !== null && v30.occ > 0) {
      const rezagadas = unidades
        .filter((u) => {
          const v = ventana(u.ventanas, 30);
          return (
            v &&
            v.occ !== null &&
            v.noches > 0 &&
            v.occ < v30.occ! * 0.6
          );
        })
        .map((u) => {
          const v = ventana(u.ventanas, 30)!;
          return `${u.nombre} (${pct0(v.occ!)})`;
        });
      if (rezagadas.length) {
        alertas.push({
          tono: "alerta",
          texto: `Muy por debajo de la media OTB a 30 dias (${pct0(v30.occ)}): ${rezagadas.join(", ")}. Son las primeras candidatas a ajuste de precio o promocion.`,
        });
      }
    }
  }

  // 7) Bloqueos que comen inventario a 30 dias.
  if (v30) {
    const inventarioTotal = v30.disponibles + v30.bloqueadas;
    if (inventarioTotal > 0 && v30.bloqueadas / inventarioTotal >= 0.08) {
      info.push({
        tono: "info",
        texto: `${v30.bloqueadas} noches bloqueadas en los proximos 30 dias (${pct0(v30.bloqueadas / inventarioTotal)} del inventario). Cada bloqueo evitable es RevPAR perdido: confirma que siguen siendo necesarios.`,
      });
    }
  }

  // 8) Proyeccion de cierre a 30 dias segun la recogida del ano pasado.
  if (v30 && v30.occProy !== null && v30.nochesSTLY > 0 && v30.occ !== null) {
    info.push({
      tono: "info",
      texto: `Proyeccion a 30 dias: cierre estimado al ${pct0(v30.occProy)} de ocupacion y ~${eur0(v30.revenueProy)} de alojamiento (OTB actual mas la recogida tipica del ano pasado).`,
    });
  }

  return [...alertas, ...buenas, ...info].slice(0, 7);
}
