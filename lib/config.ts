/**
 * Constantes de negocio compartidas entre servidor y cliente.
 * No contiene secretos, se puede importar desde componentes cliente.
 */

// Ventana movil de reservas a sincronizar.
export const VENTANA_MESES_PASADO = 18;
export const VENTANA_MESES_FUTURO = 12;

// Categorias de coste permitidas en la hoja "Costes".
export const CATEGORIAS = [
  "alquiler",
  "comunidad",
  "suministros",
  "limpieza_extra",
  "seguros",
  "ibi_tasas",
  "mantenimiento",
  "gestion",
  "marketing",
  "otros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

// Clasificacion para el P&L.
export const CATEGORIAS_VARIABLES: Categoria[] = [
  "limpieza_extra",
  "suministros",
  "mantenimiento",
  "marketing",
  "otros",
];
export const CATEGORIAS_FIJAS: Categoria[] = [
  "alquiler",
  "comunidad",
  "seguros",
  "ibi_tasas",
  "gestion",
];

export const TIPOS_UNIDAD = ["propiedad", "master_lease"] as const;
export type TipoUnidad = (typeof TIPOS_UNIDAD)[number];

// Canales normalizados para el mix.
export const CANALES = ["airbnb", "booking", "directo", "otros"] as const;
export type Canal = (typeof CANALES)[number];

/** Normaliza el source/channel crudo de Guesty a nuestro conjunto de canales. */
export function normalizarCanal(source: string | null | undefined): Canal {
  const s = (source ?? "").toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("booking") || s.includes("bookingcom")) return "booking";
  if (
    s.includes("direct") ||
    s.includes("manual") ||
    s.includes("website") ||
    s.includes("bookingengine") ||
    s.includes("owner")
  ) {
    return "directo";
  }
  return "otros";
}

export const CANAL_LABEL: Record<Canal, string> = {
  airbnb: "Airbnb",
  booking: "Booking",
  directo: "Directo",
  otros: "Otros",
};

// Banda objetivo de NOI yield TTM (unidades en propiedad), en porcentaje.
export const NOI_YIELD_VERDE = 9; // en banda o por encima
export const NOI_YIELD_AMBAR = 7; // entre 7 y 9

export type Semaforo = "verde" | "ambar" | "rojo";

/** Semaforo de NOI yield para unidades en propiedad. */
export function semaforoNoiYield(yieldPct: number | null): Semaforo | null {
  if (yieldPct === null || Number.isNaN(yieldPct)) return null;
  if (yieldPct >= NOI_YIELD_VERDE) return "verde";
  if (yieldPct >= NOI_YIELD_AMBAR) return "ambar";
  return "rojo";
}

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  alquiler: "Alquiler",
  comunidad: "Comunidad",
  suministros: "Suministros",
  limpieza_extra: "Limpieza extra",
  seguros: "Seguros",
  ibi_tasas: "IBI y tasas",
  mantenimiento: "Mantenimiento",
  gestion: "Gestion",
  marketing: "Marketing",
  otros: "Otros",
};

export const COOKIE_SESION = "alta_panel_sesion";
export const SESION_DIAS = 30;
// Limite de refresco manual, en minutos. 0 = sin limite (temporal, para pruebas).
export const REFRESH_RATE_LIMIT_MIN = 0;
