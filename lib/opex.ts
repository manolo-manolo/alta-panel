import "server-only";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db";
import { parseCsv } from "@/lib/sheets";
import { mapCategoria, normalizarNombre } from "@/lib/expense-map";

/**
 * Importacion del Opex desde el CSV pivot que mantiene el equipo.
 * Detecta anos y meses dinamicamente (fila de anos + fila de meses), mapea las
 * categorias, excluye comisiones de canal y capex, reparte "General" por coste,
 * carga los costes reales y regenera estimaciones e Ibarra 2.
 */

// Nombre de unidad en el Excel -> nickname de Guesty (o marcador especial).
const UNIT_MAP: Record<string, string> = {
  "benalmadena": "MMenaPalma1B1234",
  "general": "__GENERAL__",
  "heroe de sostoa": "HeroedeSostoa311306",
  "igueldo": "PIgueldo1090A",
  "mendiru": "PintorCRoldán1C1017",
  "ibarra": "Ibarra",
  "moreno masson": "MorenoMasson6",
  "capuchinos": "__EXCLUDE__",
  "alferez beltran": "Alférez Beltrán",
};

const MES_ACTUAL_FALLBACK = "2026-07";

interface Fila { unidad: string; mes: string; categoria: string; concepto: string; importe: number; }

export interface ResumenOpex {
  ok: boolean;
  grandParsed: number;
  operativo: number;
  excluidoComisiones: number;
  excluidoCapex: number;
  excluidoNoOperativa: number;
  unidadesNoReconocidas: string[];
  categoriasNoMapeadas: string[];
  filasCargadas: number;
  filasEstimadas: number;
  ibarra2Filas: number;
  mesesDetectados: string[];
  error?: string;
}

function num(cell: string): number {
  const s = (cell ?? "").replace(/["€\s]/g, "").replace(/,/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

/** Detecta columnas -> mes leyendo la fila de anos y la de meses. */
function columnasMes(rows: string[][], headerIdx: number): { col: number; mes: string }[] {
  const yearRow = rows[headerIdx - 1] ?? [];
  const monthRow = rows[headerIdx] ?? [];
  const cols: { col: number; mes: string }[] = [];
  let year = "";
  const maxCol = Math.max(yearRow.length, monthRow.length);
  for (let col = 1; col < maxCol; col++) {
    const yc = (yearRow[col] ?? "").trim();
    if (/^20\d\d$/.test(yc)) year = yc;
    const mc = (monthRow[col] ?? "").trim();
    const mn = Number(mc);
    if (year && Number.isInteger(mn) && mn >= 1 && mn <= 12) {
      cols.push({ col, mes: `${year}-${pad(mn)}` });
    }
  }
  return cols;
}

interface ParseResult {
  filas: Fila[];
  general: Record<string, number>;
  excl: { comision: number; capex: number; noOperativa: number };
  unidadesNoReconocidas: Set<string>;
  categoriasNoMapeadas: Set<string>;
  grandParsed: number;
  meses: string[];
}

export function parseOpex(csvText: string): ParseResult {
  const rows = parseCsv(csvText);
  const headerIdx = rows.findIndex((r) => (r[0] ?? "").trim().toLowerCase() === "row labels");
  if (headerIdx < 0) throw new Error("No se encontro la fila de cabecera 'Row Labels'");
  const monthCols = columnasMes(rows, headerIdx);
  if (monthCols.length === 0) throw new Error("No se detectaron columnas de meses");

  const filas: Fila[] = [];
  const general: Record<string, number> = {};
  const excl = { comision: 0, capex: 0, noOperativa: 0 };
  const unidadesNoReconocidas = new Set<string>();
  const categoriasNoMapeadas = new Set<string>();
  let grandParsed = 0;

  let unit: string | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const label = (rows[i][0] ?? "").trim();
    if (label === "") continue;
    if (label.toLowerCase() === "grand total") break;

    const m = mapCategoria(label);
    const esCategoria = m.categoria !== null || m.excluir !== null;

    if (!esCategoria) {
      // Cabecera de unidad
      const key = normalizarNombre(label);
      const nick = UNIT_MAP[key];
      if (!nick) { unit = "__UNKNOWN__"; unidadesNoReconocidas.add(label); continue; }
      unit = nick;
      if (nick === "__GENERAL__") {
        for (const { col, mes } of monthCols) {
          const v = num(rows[i][col]);
          if (v) { general[mes] = (general[mes] ?? 0) + v; grandParsed += v; }
        }
      }
      continue;
    }

    // Fila de categoria
    if (!unit || unit === "__GENERAL__") continue;
    for (const { col, mes } of monthCols) {
      const v = num(rows[i][col]);
      if (!v) continue;
      grandParsed += v;
      if (unit === "__EXCLUDE__" || unit === "__UNKNOWN__") { excl.noOperativa += v; continue; }
      if (m.excluir === "comision") { excl.comision += v; continue; }
      if (m.excluir === "capex") { excl.capex += v; continue; }
      if (!m.categoria) { categoriasNoMapeadas.add(label); continue; }
      filas.push({ unidad: unit, mes, categoria: m.categoria, concepto: label, importe: v });
    }
  }

  // Reparto de General por coste operativo de cada unidad ese mes
  const costeUnidadMes: Record<string, Record<string, number>> = {};
  for (const r of filas) {
    (costeUnidadMes[r.mes] ??= {});
    costeUnidadMes[r.mes][r.unidad] = (costeUnidadMes[r.mes][r.unidad] ?? 0) + r.importe;
  }
  for (const [mes, total] of Object.entries(general)) {
    const porUnidad = costeUnidadMes[mes] ?? {};
    const suma = Object.values(porUnidad).reduce((a, b) => a + b, 0);
    if (suma <= 0) continue;
    for (const [u, cst] of Object.entries(porUnidad)) {
      filas.push({ unidad: u, mes, categoria: "gestion", concepto: "General (prorrateado)", importe: (total * cst) / suma });
    }
  }

  return {
    filas, general, excl, unidadesNoReconocidas, categoriasNoMapeadas, grandParsed,
    meses: monthCols.map((c) => c.mes),
  };
}

async function insertar(client: PoolClient, filas: { mes: string; unidad: string; categoria: string; concepto: string; importe: number; estimado: boolean; origen: string }[]) {
  const chunk = 500;
  for (let i = 0; i < filas.length; i += chunk) {
    const part = filas.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of part) {
      const b = params.length;
      params.push(r.mes, r.unidad, r.categoria, r.concepto, Math.round(r.importe * 100) / 100, r.estimado, r.origen);
      tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
    }
    await client.query(
      `INSERT INTO cost_rows (mes, unidad, categoria, concepto, importe_eur, estimado, origen) VALUES ${tuples.join(",")}`,
      params,
    );
  }
}

function sumarMeses(mes: string, d: number): string {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
function rango(desde: string, hasta: string): string[] {
  const out: string[] = []; let c = desde;
  for (let i = 0; i < 60 && c <= hasta; i++) { out.push(c); c = sumarMeses(c, 1); }
  return out;
}

/**
 * Genera estimaciones a nivel de CONCEPTO (Wifi, Guesty, Energia electrica...),
 * conservando el nombre real. Run-rate para casi todo; la limpieza se proyecta
 * por el ingreso real de limpieza de cada mes.
 */
async function estimar(client: PoolClient, mesActual: string): Promise<number> {
  const { rows } = await client.query<{ unidad: string; categoria: string; concepto: string | null; mes: string; importe: number }>(
    `SELECT unidad, categoria, concepto, mes, SUM(importe_eur)::float AS importe
     FROM cost_rows WHERE origen = 'opex-excel' GROUP BY unidad, categoria, concepto, mes`,
  );
  const rev = await client.query<{ unidad: string; mes: string; rev: number }>(
    `SELECT l.nickname AS unidad, n.mes, SUM(n.cleaning_eur)::float AS rev
     FROM reservation_nights n JOIN listings l ON l.id = n.listing_id GROUP BY l.nickname, n.mes`,
  );
  const revMap: Record<string, number> = {};
  for (const r of rev.rows) revMap[`${r.unidad}|${r.mes}`] = r.rev;

  const mesesUnidad: Record<string, Set<string>> = {};
  const totalConcepto: Record<string, { categoria: string; concepto: string; total: number }> = {};
  const limpiezaTotalUnidad: Record<string, number> = {};
  const limpiezaMes: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    (mesesUnidad[r.unidad] ??= new Set()).add(r.mes);
    const concepto = r.concepto ?? r.categoria;
    const k = `${r.unidad}|${r.categoria}|${concepto}`;
    (totalConcepto[k] ??= { categoria: r.categoria, concepto, total: 0 }).total += r.importe;
    if (r.categoria === "limpieza_extra") {
      limpiezaTotalUnidad[r.unidad] = (limpiezaTotalUnidad[r.unidad] ?? 0) + r.importe;
      (limpiezaMes[r.unidad] ??= {})[r.mes] = (limpiezaMes[r.unidad]?.[r.mes] ?? 0) + r.importe;
    }
  }

  const nuevas: { mes: string; unidad: string; categoria: string; concepto: string; importe: number; estimado: boolean; origen: string }[] = [];
  for (const [unidad, meses] of Object.entries(mesesUnidad)) {
    const orden = [...meses].sort();
    const span = rango(orden[0], orden[orden.length - 1]).length;
    const estimarMeses = rango(sumarMeses(orden[orden.length - 1], 1), mesActual);
    if (!estimarMeses.length) continue;
    let numer = 0, denom = 0;
    for (const [mes, c] of Object.entries(limpiezaMes[unidad] ?? {})) {
      const rv = revMap[`${unidad}|${mes}`]; if (rv > 0) { numer += c; denom += rv; }
    }
    const ratio = denom > 0 ? numer / denom : null;

    for (const k of Object.keys(totalConcepto)) {
      if (!k.startsWith(`${unidad}|`)) continue;
      const { categoria, concepto, total } = totalConcepto[k];
      if (categoria === "limpieza_extra" && ratio !== null && limpiezaTotalUnidad[unidad] > 0) {
        const share = total / limpiezaTotalUnidad[unidad];
        for (const mes of estimarMeses) {
          const v = ratio * (revMap[`${unidad}|${mes}`] ?? 0) * share;
          if (Math.abs(v) >= 0.5) nuevas.push({ mes, unidad, categoria, concepto, importe: v, estimado: true, origen: "estimado" });
        }
      } else {
        const media = total / span;
        if (Math.abs(media) < 0.5) continue;
        for (const mes of estimarMeses) nuevas.push({ mes, unidad, categoria, concepto, importe: media, estimado: true, origen: "estimado" });
      }
    }
  }
  await insertar(client, nuevas);
  return nuevas.length;
}

/** Regenera Ibarra 2 como perfil de Ibarra + 80 EUR de renta. */
async function ibarra2(client: PoolClient): Promise<number> {
  const idr = await client.query<{ id: string }>("SELECT id FROM listings WHERE nickname = 'Ibarra 2'");
  if (!idr.rows[0]) return 0;
  const id = idr.rows[0].id;
  const mesesR = await client.query<{ mes: string }>("SELECT DISTINCT mes FROM reservation_nights WHERE listing_id = $1", [id]);
  let filas = 0;
  const nuevas: { mes: string; unidad: string; categoria: string; concepto: string; importe: number; estimado: boolean; origen: string }[] = [];
  for (const { mes } of mesesR.rows) {
    const src = await client.query<{ categoria: string; concepto: string | null; importe_eur: number }>(
      `SELECT categoria, concepto, importe_eur FROM cost_rows WHERE unidad = 'Ibarra' AND mes = $1 AND origen IN ('opex-excel','estimado')`,
      [mes],
    );
    for (const r of src.rows) {
      nuevas.push({ mes, unidad: "Ibarra 2", categoria: r.categoria, concepto: r.concepto ? `${r.concepto} (perfil Ibarra)` : "Perfil Ibarra", importe: r.importe_eur, estimado: true, origen: "ibarra2" });
      filas++;
    }
    nuevas.push({ mes, unidad: "Ibarra 2", categoria: "alquiler", concepto: "Suplemento renta (+80)", importe: 80, estimado: true, origen: "ibarra2" });
    filas++;
  }
  await insertar(client, nuevas);
  const rentaR = await client.query<{ r: number }>(
    `SELECT importe_eur AS r FROM cost_rows WHERE unidad='Ibarra' AND categoria='alquiler' AND origen='opex-excel' ORDER BY mes DESC LIMIT 1`,
  );
  const renta = Math.round((rentaR.rows[0]?.r ?? 1962) + 80);
  await client.query(
    `INSERT INTO unit_settings (listing_id, display_name, tipo, renta_mensual_eur, updated_at)
     VALUES ($1, 'Ibarra 2', 'master_lease', $2, now())
     ON CONFLICT (listing_id) DO UPDATE SET tipo='master_lease', renta_mensual_eur=EXCLUDED.renta_mensual_eur, updated_at=now()`,
    [id, renta],
  );
  return filas;
}

/** Pipeline completo de importacion. */
export async function importarOpex(csvText: string, mesActual = MES_ACTUAL_FALLBACK): Promise<ResumenOpex> {
  const p = parseOpex(csvText);
  let filasEstimadas = 0;
  let ibarra2Filas = 0;

  await withTransaction(async (client) => {
    await client.query("DELETE FROM cost_rows WHERE origen IN ('opex-excel','estimado','ibarra2')");
    await insertar(
      client,
      p.filas.map((r) => ({ ...r, estimado: false, origen: "opex-excel" })),
    );
    filasEstimadas = await estimar(client, mesActual);
    ibarra2Filas = await ibarra2(client);
  });

  return {
    ok: true,
    grandParsed: Math.round(p.grandParsed),
    operativo: Math.round(p.filas.reduce((a, r) => a + r.importe, 0)),
    excluidoComisiones: Math.round(p.excl.comision),
    excluidoCapex: Math.round(p.excl.capex),
    excluidoNoOperativa: Math.round(p.excl.noOperativa),
    unidadesNoReconocidas: [...p.unidadesNoReconocidas],
    categoriasNoMapeadas: [...p.categoriasNoMapeadas],
    filasCargadas: p.filas.length,
    filasEstimadas,
    ibarra2Filas,
    mesesDetectados: p.meses,
  };
}
