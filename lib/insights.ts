// Genera observaciones y consejos a partir de las metricas del periodo.
// Puro y client-safe.

export type Tono = "bueno" | "alerta" | "info";
export interface Insight {
  tono: Tono;
  texto: string;
}

export interface InsightInput {
  occPortfolio: number | null;
  filas: {
    nombre: string;
    ocupacion: number | null;
    tipo: "propiedad" | "master_lease" | null;
    rendimiento: number | null; // yield o margen %
    rendimientoTipo: "yield" | "margen" | null;
    costesPendientes: boolean;
  }[];
  limpiezaNeto: number;
  limpiezaMargen: number | null;
  pacing30Noches: number;
  pacing30NochesLY: number;
  mixAirbnbPct: number | null;
  ratingMedio: number | null;
}

const eur0 = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct1 = (f: number) => `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(f * 100)}%`;

export function generarInsights(i: InsightInput): Insight[] {
  const alertas: Insight[] = [];
  const buenas: Insight[] = [];
  const info: Insight[] = [];

  // Limpieza
  if (i.limpiezaNeto < 0) {
    alertas.push({
      tono: "alerta",
      texto: `La limpieza deja ${eur0(i.limpiezaNeto)} (margen ${i.limpiezaMargen !== null ? pct1(i.limpiezaMargen) : "n/d"}). Sube la tarifa de limpieza o negocia la comision del canal sobre ella.`,
    });
  }

  // Ocupacion por unidad vs media
  if (i.occPortfolio !== null) {
    const bajas = i.filas.filter((f) => f.ocupacion !== null && f.ocupacion < i.occPortfolio! * 0.8);
    if (bajas.length) {
      alertas.push({
        tono: "alerta",
        texto: `${bajas.length} unidad(es) muy por debajo de la ocupacion media (${pct1(i.occPortfolio)}): ${bajas.map((b) => b.nombre).join(", ")}. Revisa precio o visibilidad.`,
      });
    }
  }

  // Yield de propiedades fuera de banda
  const propBaja = i.filas.filter((f) => f.rendimientoTipo === "yield" && f.rendimiento !== null && f.rendimiento < 7);
  if (propBaja.length) {
    alertas.push({
      tono: "alerta",
      texto: `NOI yield por debajo del 7% en: ${propBaja.map((p) => `${p.nombre} (${pct1(p.rendimiento! / 100)})`).join(", ")}.`,
    });
  }
  const propBuena = i.filas.filter((f) => f.rendimientoTipo === "yield" && f.rendimiento !== null && f.rendimiento >= 9);
  if (propBuena.length) {
    buenas.push({
      tono: "bueno",
      texto: `NOI yield en banda objetivo (>=9%): ${propBuena.map((p) => `${p.nombre} (${pct1(p.rendimiento! / 100)})`).join(", ")}.`,
    });
  }

  // Pacing 30 dias
  if (i.pacing30NochesLY > 0) {
    const v = (i.pacing30Noches - i.pacing30NochesLY) / i.pacing30NochesLY;
    if (v <= -0.1) alertas.push({ tono: "alerta", texto: `Cartera a 30 dias por debajo del ano pasado (${pct1(v)} noches). Considera ajustar precios o promociones.` });
    else if (v >= 0.1) buenas.push({ tono: "bueno", texto: `Cartera a 30 dias por encima del ano pasado (${pct1(v)} noches).` });
  }

  // Dependencia de canal
  if (i.mixAirbnbPct !== null && i.mixAirbnbPct >= 0.85) {
    info.push({ tono: "info", texto: `Alta dependencia de Airbnb (${pct1(i.mixAirbnbPct)} de los ingresos). Diversificar canales reduce riesgo.` });
  }

  // Reviews
  if (i.ratingMedio !== null) {
    if (i.ratingMedio < 4.7) alertas.push({ tono: "alerta", texto: `Rating medio ${i.ratingMedio.toFixed(2)} por debajo de 4,7. Revisa las reviews recientes por debajo de 5 estrellas.` });
    else if (i.ratingMedio >= 4.85) buenas.push({ tono: "bueno", texto: `Rating medio excelente (${i.ratingMedio.toFixed(2)}).` });
  }

  // Costes pendientes
  const pend = i.filas.filter((f) => f.costesPendientes);
  if (pend.length) {
    info.push({ tono: "info", texto: `${pend.length} unidad(es) sin costes cargados (su NOI esta sobrestimado): ${pend.map((p) => p.nombre).join(", ")}.` });
  }

  return [...alertas, ...buenas, ...info].slice(0, 6);
}
