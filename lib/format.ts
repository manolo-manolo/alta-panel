// Utilidades de formato en espanol (Espana). Sin simbolos de apertura de
// interrogacion y sin guiones largos en ningun texto de la app.

// useGrouping "always" fuerza el separador de miles tambien en numeros de 4
// cifras (en es-ES por defecto 1.350 se mostraria como 1350).
const nfEur0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  useGrouping: "always",
});
const nfEur2 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});
const nfNum0 = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
  useGrouping: "always",
});
const nfNum1 = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: "always",
});

export function eur(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return decimales === 2 ? nfEur2.format(n) : nfEur0.format(n);
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return nfNum0.format(n);
}

export function pct(fraccion: number | null | undefined, decimales = 1): string {
  if (fraccion === null || fraccion === undefined || Number.isNaN(fraccion)) {
    return "-";
  }
  const v = fraccion * 100;
  return decimales === 0
    ? `${nfNum0.format(v)}%`
    : `${nfNum1.format(v)}%`;
}

/** Porcentaje ya expresado en base 100 (p. ej. NOI yield). */
export function pctDirecto(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${nfNum1.format(v)}%`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** 'YYYY-MM' -> 'julio 2026'. */
export function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  return `${MESES[m - 1]} ${y}`;
}

/** 'YYYY-MM' -> 'jul 26' (compacto para ejes de graficos). */
export function mesCorto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  if (!y || !m) return mes;
  return `${MESES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

/** 'YYYY-MM-DD' (o Date/ISO) -> '15 jul 2026'. */
export function fecha(f: string | Date | null | undefined): string {
  if (!f) return "-";
  const s =
    typeof f === "string"
      ? f
      : f instanceof Date
        ? f.toISOString()
        : String(f);
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MESES[m - 1].slice(0, 3)} ${y}`;
}

/** Fecha y hora legible a partir de un ISO. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(d);
}

/** Variacion relativa entre valor actual y anterior (fraccion). */
export function delta(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null;
  return (actual - anterior) / Math.abs(anterior);
}
