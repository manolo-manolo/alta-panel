import "server-only";
import {
  type Categoria,
  TIPOS_UNIDAD,
  type TipoUnidad,
} from "@/lib/config";
import { mapCategoria, normalizarNombre } from "@/lib/expense-map";

/**
 * Resolver de unidad: mapa de nombre normalizado (nickname o nombre a mostrar)
 * al nickname canonico de Guesty. Permite que la hoja use nombres amigables.
 */
export type ResolverUnidad = Map<string, string>;

/**
 * Lectura y validacion de las hojas de Google (publicadas como CSV).
 * Se validan las filas y se devuelven los errores para mostrarlos en la UI
 * ("filas con errores") en lugar de fallar en silencio.
 */

const FETCH_TIMEOUT_MS = 20_000;

export interface FilaError {
  hoja: "Costes" | "Unidades";
  fila: number; // numero de fila de datos (1 = primera fila bajo la cabecera)
  error: string;
  valores: Record<string, string>;
}

export interface CosteRow {
  mes: string;
  unidad: string;
  categoria: Categoria;
  concepto: string | null;
  importe_eur: number;
}

export interface UnidadRow {
  unidad: string;
  tipo: TipoUnidad;
  coste_total_adquisicion_eur: number | null;
  renta_mensual_eur: number | null;
  fecha_inicio: string | null;
}

// --- Descarga ---
async function fetchCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      throw new Error(`La hoja respondio HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// --- Parser CSV (comillas dobles, comas y saltos de linea dentro de celdas) ---
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // quita BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignorar; el \n siguiente cierra la fila
    } else {
      field += c;
    }
  }
  // ultima celda / fila si el archivo no termina en salto de linea
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // descarta filas totalmente vacias
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Convierte texto a objetos usando la cabecera (claves normalizadas). */
function toObjects(rows: string[][]): {
  headers: string[];
  records: Record<string, string>[];
} {
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, records };
}

/** Parsea un importe admitiendo formato europeo (1.234,56) y anglosajon (1234.56). */
export function parseImporte(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "").replace(/[€]/g, "");
  if (s === "") return null;
  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");
  if (tienePunto && tieneComa) {
    // El ultimo separador es el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (tieneComa) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function esMesValido(mes: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(mes)) return false;
  const m = Number(mes.slice(5, 7));
  return m >= 1 && m <= 12;
}

function esFechaValida(f: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

const TIPOSET = new Set<string>(TIPOS_UNIDAD);

export interface CargaCostes {
  rows: CosteRow[];
  errores: FilaError[];
}

/**
 * Valida la hoja Costes. Si se pasan `nicknamesConocidos`, se marca como error
 * cualquier `unidad` que no coincida exactamente con un listing de Guesty.
 */
export async function cargarCostes(
  url: string,
  resolver?: ResolverUnidad,
): Promise<CargaCostes> {
  const text = await fetchCsv(url);
  const { headers, records } = toObjects(parseCsv(text));

  const requeridas = ["mes", "unidad", "categoria", "concepto", "importe_eur"];
  const faltan = requeridas.filter((h) => !headers.includes(h));
  if (faltan.length) {
    return {
      rows: [],
      errores: [
        {
          hoja: "Costes",
          fila: 0,
          error: `Faltan columnas en la cabecera: ${faltan.join(", ")}`,
          valores: {},
        },
      ],
    };
  }

  const rows: CosteRow[] = [];
  const errores: FilaError[] = [];

  records.forEach((rec, idx) => {
    const fila = idx + 1;
    const problemas: string[] = [];
    const mes = rec["mes"];
    const unidad = rec["unidad"];
    const mapeo = mapCategoria(rec["categoria"]);
    const importe = parseImporte(rec["importe_eur"]);

    // Comisiones de canal y capex no entran en el P&L operativo: se ignoran
    // sin marcarlas como error.
    if (mapeo.excluir) return;

    let unidadCanonica = unidad;
    if (!esMesValido(mes)) problemas.push("mes invalido (formato YYYY-MM)");
    if (!unidad) problemas.push("unidad vacia");
    else if (resolver) {
      const c = resolver.get(normalizarNombre(unidad));
      if (!c) problemas.push(`unidad "${unidad}" no coincide con ninguna unidad`);
      else unidadCanonica = c;
    }
    if (!mapeo.categoria) {
      problemas.push(`categoria no reconocida "${rec["categoria"]}"`);
    }
    if (importe === null) problemas.push("importe_eur no es un numero");

    if (problemas.length) {
      errores.push({ hoja: "Costes", fila, error: problemas.join("; "), valores: rec });
      return;
    }

    rows.push({
      mes,
      unidad: unidadCanonica,
      categoria: mapeo.categoria as Categoria,
      concepto: rec["concepto"] || null,
      importe_eur: importe as number,
    });
  });

  return { rows, errores };
}

export interface CargaUnidades {
  rows: UnidadRow[];
  errores: FilaError[];
}

/** Valida la hoja Unidades. */
export async function cargarUnidades(
  url: string,
  resolver?: ResolverUnidad,
): Promise<CargaUnidades> {
  const text = await fetchCsv(url);
  const { headers, records } = toObjects(parseCsv(text));

  const requeridas = [
    "unidad",
    "tipo",
    "coste_total_adquisicion_eur",
    "renta_mensual_eur",
    "fecha_inicio",
  ];
  const faltan = requeridas.filter((h) => !headers.includes(h));
  if (faltan.length) {
    return {
      rows: [],
      errores: [
        {
          hoja: "Unidades",
          fila: 0,
          error: `Faltan columnas en la cabecera: ${faltan.join(", ")}`,
          valores: {},
        },
      ],
    };
  }

  const rows: UnidadRow[] = [];
  const errores: FilaError[] = [];

  records.forEach((rec, idx) => {
    const fila = idx + 1;
    const problemas: string[] = [];
    const unidad = rec["unidad"];
    const tipo = rec["tipo"].toLowerCase();
    const coste = parseImporte(rec["coste_total_adquisicion_eur"]);
    const renta = parseImporte(rec["renta_mensual_eur"]);
    const fecha = rec["fecha_inicio"];

    let unidadCanonica = unidad;
    if (!unidad) problemas.push("unidad vacia");
    else if (resolver) {
      const c = resolver.get(normalizarNombre(unidad));
      if (!c) problemas.push(`unidad "${unidad}" no coincide con ninguna unidad`);
      else unidadCanonica = c;
    }
    if (!TIPOSET.has(tipo)) {
      problemas.push(`tipo invalido "${rec["tipo"]}" (propiedad | master_lease)`);
    }
    if (tipo === "propiedad" && coste === null) {
      problemas.push("propiedad sin coste_total_adquisicion_eur");
    }
    if (tipo === "master_lease" && renta === null) {
      problemas.push("master_lease sin renta_mensual_eur");
    }
    if (fecha && !esFechaValida(fecha)) {
      problemas.push("fecha_inicio invalida (formato YYYY-MM-DD)");
    }

    if (problemas.length) {
      errores.push({ hoja: "Unidades", fila, error: problemas.join("; "), valores: rec });
      return;
    }

    rows.push({
      unidad: unidadCanonica,
      tipo: tipo as TipoUnidad,
      coste_total_adquisicion_eur: coste,
      renta_mensual_eur: renta,
      fecha_inicio: fecha || null,
    });
  });

  return { rows, errores };
}
