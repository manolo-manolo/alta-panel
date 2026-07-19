import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Europe/Madrid";

/** 'YYYY-MM-DD' de una fecha ISO o Date, tomando solo la parte de fecha. */
export function toDateStr(input: string | Date): string {
  if (typeof input === "string") {
    // Puede venir como 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm:ssZ'.
    return input.slice(0, 10);
  }
  return input.toISOString().slice(0, 10);
}

/** 'YYYY-MM' a partir de una fecha 'YYYY-MM-DD'. */
export function mesDe(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function parseUTC(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
}

function addDaysUTC(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/**
 * Noches entre check-in (incluido) y check-out (excluido).
 * Devuelve la lista de fechas 'YYYY-MM-DD' de cada noche pernoctada.
 */
export function nochesEntre(checkIn: string, checkOut: string): string[] {
  const start = parseUTC(checkIn);
  const end = parseUTC(checkOut);
  const out: string[] = [];
  for (let d = start; d < end; d = addDaysUTC(d, 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Numero de dias entre dos fechas (b - a). Positivo si b es posterior. */
export function diffDias(a: string, b: string): number {
  const ms = parseUTC(b).getTime() - parseUTC(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Hoy en Europe/Madrid como 'YYYY-MM-DD'. */
export function hoyMadrid(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

/** Mes actual en Europe/Madrid como 'YYYY-MM'. */
export function mesActualMadrid(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM");
}

/** Suma (o resta) meses a una clave 'YYYY-MM'. */
export function sumarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Lista inclusiva de claves de mes entre `desde` y `hasta`. */
export function rangoMeses(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let cur = desde;
  // Guardia de seguridad para no iterar infinito.
  for (let i = 0; i < 600 && cur <= hasta; i++) {
    out.push(cur);
    cur = sumarMeses(cur, 1);
  }
  return out;
}

/** Los 12 meses (TTM) que terminan en `mes`, incluido. */
export function meses12(mes: string): string[] {
  return rangoMeses(sumarMeses(mes, -11), mes);
}

/** Meses del ano hasta `mes` incluido (YTD). */
export function mesesYTD(mes: string): string[] {
  const [y] = mes.split("-");
  return rangoMeses(`${y}-01`, mes);
}

/** Anade N dias a una fecha 'YYYY-MM-DD'. */
export function sumarDias(dateStr: string, n: number): string {
  return addDaysUTC(parseUTC(dateStr), n).toISOString().slice(0, 10);
}
