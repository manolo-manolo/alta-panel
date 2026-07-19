import { CATEGORIAS, type Categoria } from "@/lib/config";

/**
 * Mapea las categorias reales que usa el equipo (nombres detallados en espanol)
 * a las 10 categorias del P&L, y detecta filas que NO deben entrar en el NOI:
 *  - "comision": comisiones y tarifas de canal (ya vienen de Guesty).
 *  - "capex": inversiones/puesta en marcha (montaje, reforma, notaria, amortizacion).
 */

export type ExclusionTipo = "comision" | "capex";

export interface MapeoCategoria {
  categoria: Categoria | null;
  excluir: ExclusionTipo | null;
}

/** Normaliza un nombre para comparar (minusculas, sin acentos, sin espacios extra). */
export function normalizarNombre(s: string): string {
  return norm(s);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .trim();
}

const CANON = new Set<string>(CATEGORIAS);

// Coincidencias por "incluye" sobre el texto normalizado. Orden importa:
// primero exclusiones, luego mapeos.
const COMISION: string[] = [
  "comision", "tarifa servicio", "host service", "channel fee",
];
const CAPEX: string[] = [
  "amortizacion", "montaje", "reforma", "notaria", "registro",
  "retirada muebles", "extraordinari", "okupas", "certificado de dominio",
  "gastos montaje",
];

// concepto normalizado (incluye) -> categoria
const MAPEO: [string, Categoria][] = [
  ["renta mensual", "alquiler"],
  ["alquiler", "alquiler"],
  ["comunidad", "comunidad"],
  ["ibi", "ibi_tasas"],
  ["tasa basura", "ibi_tasas"],
  ["basura", "ibi_tasas"],
  ["seguro", "seguros"],
  ["seguridad", "seguros"],
  ["limpieza", "limpieza_extra"],
  ["lavanderia", "limpieza_extra"],
  ["mantenimiento", "mantenimiento"],
  ["reparacion", "mantenimiento"],
  ["ferreteria", "mantenimiento"],
  ["energia electrica", "suministros"],
  ["electrica", "suministros"],
  ["agua", "suministros"],
  ["wifi", "suministros"],
  ["internet", "suministros"],
  ["guesty", "gestion"],
  ["pricelabs", "gestion"],
  ["hostai", "gestion"],
  ["chekin", "gestion"],
  ["nuki", "gestion"],
  ["smart hosting", "gestion"],
  ["home sensor", "gestion"],
  ["gestion", "gestion"],
  ["gestoria", "gestion"],
  ["marketing", "marketing"],
  ["fotografia", "marketing"],
  ["amenities", "otros"],
  ["reposicion", "otros"],
  ["trona", "otros"],
  ["cuna", "otros"],
  ["muletas", "otros"],
  ["cafetera", "otros"],
  ["compras", "otros"],
  ["recogida", "otros"],
  ["varios", "otros"],
  ["otros", "otros"],
];

export function mapCategoria(raw: string): MapeoCategoria {
  const n = norm(raw);
  if (n === "") return { categoria: null, excluir: null };

  // Ya es una de nuestras categorias canonicas
  if (CANON.has(n)) return { categoria: n as Categoria, excluir: null };

  if (COMISION.some((k) => n.includes(k))) return { categoria: null, excluir: "comision" };
  if (CAPEX.some((k) => n.includes(k))) return { categoria: null, excluir: "capex" };

  for (const [clave, cat] of MAPEO) {
    if (n.includes(clave)) return { categoria: cat, excluir: null };
  }
  return { categoria: null, excluir: null };
}
