import "server-only";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import { parseCsv } from "@/lib/sheets";
import { mapCategoria, normalizarNombre } from "@/lib/expense-map";

// Origenes que contienen costes REALES (no estimados).
const REAL_ORIGENES = ["opex-excel", "opex-v2"];

/** Forma compacta para casar nombres de unidad: minusculas, sin acentos ni simbolos. */
function compactar(s: string): string {
  return normalizarNombre(s).replace(/[^a-z0-9]/g, "");
}

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
  formato: "pivot" | "mensual";
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

// --- Formato v2 (mensual): Unidad | Categoria | Jan-26 | Feb-26 | ... ---

const MES_ABREV: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ene: 1, abr: 4, ago: 8, dic: 12,
};

function parseMesHeader(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^([a-z]{3})[-\s]?(\d{2}|\d{4})$/);
  if (m && MES_ABREV[m[1]]) {
    const y = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${y}-${pad(MES_ABREV[m[1]])}`;
  }
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function numV2(cell: string): number {
  let s = (cell ?? "").replace(/["€\s]/g, "");
  if (s === "") return 0;
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,(?=\d{3}\b)/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** True si el texto parece el formato mensual v2 (cabecera Unidad/Categoria). */
export function esFormatoV2(text: string): boolean {
  const primera = (text.split(/\r?\n/, 1)[0] ?? "").toLowerCase();
  return primera.includes("unidad") && primera.includes("categoria");
}

/**
 * Parsea el formato mensual v2. `resolverCompacto` mapea la forma compacta del
 * nombre de unidad del archivo al nickname canonico de Guesty.
 */
export function parseOpexV2(
  text: string,
  resolverCompacto: Map<string, string>,
): ParseResult {
  const usaTab = (text.split(/\r?\n/, 1)[0] ?? "").includes("\t");
  const rows: string[][] = usaTab
    ? text.split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => l.split("\t"))
    : parseCsv(text);
  if (rows.length < 2) throw new Error("Archivo vacio o sin filas de datos");

  const header = rows[0];
  const monthCols: { col: number; mes: string }[] = [];
  for (let c = 2; c < header.length; c++) {
    const mes = parseMesHeader(header[c] ?? "");
    if (mes) monthCols.push({ col: c, mes });
  }
  if (monthCols.length === 0) {
    throw new Error("No se detectaron columnas de meses en la cabecera");
  }

  const filas: Fila[] = [];
  const excl = { comision: 0, capex: 0, noOperativa: 0 };
  const unidadesNoReconocidas = new Set<string>();
  const categoriasNoMapeadas = new Set<string>();
  let grandParsed = 0;

  for (let i = 1; i < rows.length; i++) {
    const unidadRaw = (rows[i][0] ?? "").trim();
    const categoriaRaw = (rows[i][1] ?? "").trim();
    if (!unidadRaw || !categoriaRaw) continue;

    const nick = resolverCompacto.get(compactar(unidadRaw));
    const m = mapCategoria(categoriaRaw);

    for (const { col, mes } of monthCols) {
      const v = numV2(rows[i][col]);
      if (!v) continue;
      grandParsed += v;
      if (!nick) { unidadesNoReconocidas.add(unidadRaw); excl.noOperativa += v; continue; }
      if (m.excluir === "comision") { excl.comision += v; continue; }
      if (m.excluir === "capex") { excl.capex += v; continue; }
      if (!m.categoria) { categoriasNoMapeadas.add(categoriaRaw); continue; }
      filas.push({ unidad: nick, mes, categoria: m.categoria, concepto: categoriaRaw, importe: v });
    }
  }

  return {
    filas, general: {}, excl, unidadesNoReconocidas, categoriasNoMapeadas,
    grandParsed, meses: monthCols.map((c) => c.mes),
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
 * Genera estimaciones a nivel de CONCEPTO conservando el nombre real.
 * - Rellena HUECOS: cualquier mes sin datos reales entre el primer mes real de
 *   la unidad y el mes actual (no solo la cola).
 * - Run-rate calculado sobre los ULTIMOS (hasta 6) meses reales, para reflejar
 *   la estructura de costes vigente y no mezclar vocabularios antiguos.
 * - La limpieza se proyecta proporcional al ingreso real de limpieza del mes.
 */
async function estimar(client: PoolClient, mesActual: string): Promise<number> {
  const { rows } = await client.query<{ unidad: string; categoria: string; concepto: string | null; mes: string; importe: number }>(
    `SELECT unidad, categoria, concepto, mes, SUM(importe_eur)::float AS importe
     FROM cost_rows WHERE origen = ANY($1) GROUP BY unidad, categoria, concepto, mes`,
    [REAL_ORIGENES],
  );
  const rev = await client.query<{ unidad: string; mes: string; rev: number }>(
    `SELECT l.nickname AS unidad, n.mes, SUM(n.cleaning_eur)::float AS rev
     FROM reservation_nights n JOIN listings l ON l.id = n.listing_id GROUP BY l.nickname, n.mes`,
  );
  const revMap: Record<string, number> = {};
  for (const r of rev.rows) revMap[`${r.unidad}|${r.mes}`] = r.rev;

  const mesesUnidad: Record<string, Set<string>> = {};
  for (const r of rows) (mesesUnidad[r.unidad] ??= new Set()).add(r.mes);

  const nuevas: { mes: string; unidad: string; categoria: string; concepto: string; importe: number; estimado: boolean; origen: string }[] = [];

  for (const [unidad, meses] of Object.entries(mesesUnidad)) {
    const orden = [...meses].sort();
    // Ventana reciente: ultimos hasta 6 meses reales.
    const recientes = new Set(orden.slice(-6));
    const nRecientes = recientes.size;
    // Meses a estimar: huecos entre el primer mes real y el mes actual.
    const estimarMeses = rango(orden[0], mesActual).filter((m) => !meses.has(m));
    if (!estimarMeses.length) continue;

    // Totales por concepto sobre la ventana reciente.
    const totalConcepto: Record<string, { categoria: string; concepto: string; total: number }> = {};
    let limpTotal = 0, limpRevTotal = 0;
    for (const r of rows) {
      if (r.unidad !== unidad || !recientes.has(r.mes)) continue;
      const concepto = r.concepto ?? r.categoria;
      const k = `${r.categoria}|${concepto}`;
      (totalConcepto[k] ??= { categoria: r.categoria, concepto, total: 0 }).total += r.importe;
      if (r.categoria === "limpieza_extra") {
        const rv = revMap[`${unidad}|${r.mes}`];
        if (rv && rv > 0) { limpTotal += r.importe; limpRevTotal += rv; }
      }
    }
    const ratio = limpRevTotal > 0 ? limpTotal / limpRevTotal : null;
    const limpConceptoTotal = Object.values(totalConcepto)
      .filter((t) => t.categoria === "limpieza_extra")
      .reduce((a, t) => a + t.total, 0);

    for (const { categoria, concepto, total } of Object.values(totalConcepto)) {
      if (categoria === "limpieza_extra" && ratio !== null && limpConceptoTotal > 0) {
        const share = total / limpConceptoTotal;
        for (const mes of estimarMeses) {
          const v = ratio * (revMap[`${unidad}|${mes}`] ?? 0) * share;
          if (Math.abs(v) >= 0.5) nuevas.push({ mes, unidad, categoria, concepto, importe: v, estimado: true, origen: "estimado" });
        }
      } else {
        const media = total / nRecientes;
        if (Math.abs(media) < 0.5) continue;
        for (const mes of estimarMeses) nuevas.push({ mes, unidad, categoria, concepto, importe: media, estimado: true, origen: "estimado" });
      }
    }
  }
  await insertar(client, nuevas);
  return nuevas.length;
}

/**
 * Ibarra 2 es un contrato de revenue share, no una renta fija:
 *   base = ingreso de alojamiento (sin limpieza) - comision OTA atribuible
 *   pago al propietario = 75% de la base (AltaHomes retiene el 25%).
 * Ese pago se registra cada mes como coste de "alquiler" (variable), calculado
 * sobre el ingreso real de la unidad. La limpieza (ingreso y coste) y el resto
 * de opex quedan integros en nuestro P&L.
 * Para meses antiguos sin costes propios se replica ademas el perfil operativo
 * de Ibarra (sin alquiler) como estimacion.
 */
const IBARRA2_OWNER_SHARE = 0.75;

async function ibarra2(client: PoolClient): Promise<number> {
  const idr = await client.query<{ id: string }>("SELECT id FROM listings WHERE nickname = 'Ibarra 2'");
  if (!idr.rows[0]) return 0;
  const id = idr.rows[0].id;

  // Ingresos reales por mes desde las noches sincronizadas de Guesty.
  const revR = await client.query<{ mes: string; alo: number; limp: number; com: number }>(
    `SELECT mes,
            COALESCE(SUM(accommodation_eur),0)::float AS alo,
            COALESCE(SUM(cleaning_eur),0)::float AS limp,
            COALESCE(SUM(commission_eur),0)::float AS com
     FROM reservation_nights WHERE listing_id = $1 GROUP BY mes`,
    [id],
  );

  const realesR = await client.query<{ mes: string }>(
    `SELECT DISTINCT mes FROM cost_rows WHERE unidad = 'Ibarra 2' AND origen = ANY($1)`,
    [REAL_ORIGENES],
  );
  const mesesReales = new Set(realesR.rows.map((r) => r.mes));
  const primeraReal = [...mesesReales].sort()[0] ?? null;

  let filas = 0;
  const nuevas: { mes: string; unidad: string; categoria: string; concepto: string; importe: number; estimado: boolean; origen: string }[] = [];

  for (const { mes, alo, limp, com } of revR.rows) {
    // Comision atribuible al alojamiento (la parte de la limpieza se excluye).
    const comAlo = alo + limp > 0 ? (com * alo) / (alo + limp) : com;
    const base = alo - comAlo;
    const payout = IBARRA2_OWNER_SHARE * base;
    if (Math.abs(payout) >= 0.5) {
      // Contractual y deterministico sobre ingresos reales: no es estimacion.
      nuevas.push({
        mes, unidad: "Ibarra 2", categoria: "alquiler",
        concepto: "Pago propietario (75% de alojamiento neto de comision)",
        importe: payout, estimado: false, origen: "ibarra2",
      });
      filas++;
    }

    // Meses antiguos sin costes propios: replicar el opex de Ibarra (sin
    // alquiler) como aproximacion del coste operativo.
    const anteriorAlPrimerReal = primeraReal === null || mes < primeraReal;
    if (!mesesReales.has(mes) && anteriorAlPrimerReal) {
      const src = await client.query<{ categoria: string; concepto: string | null; importe_eur: number }>(
        `SELECT categoria, concepto, importe_eur FROM cost_rows
         WHERE unidad = 'Ibarra' AND mes = $1 AND categoria <> 'alquiler' AND origen = ANY($2)`,
        [mes, [...REAL_ORIGENES, "estimado"]],
      );
      for (const r of src.rows) {
        nuevas.push({ mes, unidad: "Ibarra 2", categoria: r.categoria, concepto: r.concepto ?? r.categoria, importe: r.importe_eur, estimado: true, origen: "ibarra2" });
        filas++;
      }
    }
  }

  await insertar(client, nuevas);
  // Revenue share: sin renta fija mensual.
  await client.query(
    `INSERT INTO unit_settings (listing_id, display_name, tipo, renta_mensual_eur, updated_at)
     VALUES ($1, 'Ibarra 2', 'master_lease', NULL, now())
     ON CONFLICT (listing_id) DO UPDATE SET tipo='master_lease', renta_mensual_eur=NULL, updated_at=now()`,
    [id],
  );
  return filas;
}

/**
 * Regenera solo las estimaciones e Ibarra 2 (sin tocar los costes reales).
 * Lo llama el sync nocturno para que los meses estimados avancen con el
 * calendario y sigan la evolucion del ingreso de limpieza.
 */
export async function regenerarEstimaciones(mesActual: string): Promise<{
  filasEstimadas: number;
  ibarra2Filas: number;
}> {
  let filasEstimadas = 0;
  let ibarra2Filas = 0;
  await withTransaction(async (client) => {
    await client.query("DELETE FROM cost_rows WHERE origen IN ('estimado','ibarra2')");
    filasEstimadas = await estimar(client, mesActual);
    ibarra2Filas = await ibarra2(client);
  });
  return { filasEstimadas, ibarra2Filas };
}

/**
 * Pipeline completo de importacion. Detecta el formato automaticamente:
 * - "pivot": el Excel historico (Row Labels + bloques por unidad).
 * - "mensual": Unidad | Categoria | columnas de mes (formato de Inmaculada 2026).
 * Cada formato reemplaza solo sus propias filas; el otro se conserva.
 */
export async function importarOpex(csvText: string, mesActual = MES_ACTUAL_FALLBACK): Promise<ResumenOpex> {
  const esV2 = esFormatoV2(csvText);
  let p: ParseResult;
  let origen: string;

  if (esV2) {
    // Resolver de unidades desde la BD: forma compacta -> nickname canonico.
    const listings = await query<{ nickname: string | null; display_name: string | null }>(
      `SELECT l.nickname, s.display_name
       FROM listings l LEFT JOIN unit_settings s ON s.listing_id = l.id`,
    );
    const resolver = new Map<string, string>();
    for (const l of listings) {
      if (!l.nickname) continue;
      resolver.set(compactar(l.nickname), l.nickname);
      if (l.display_name) resolver.set(compactar(l.display_name), l.nickname);
    }
    p = parseOpexV2(csvText, resolver);
    origen = "opex-v2";
  } else {
    p = parseOpex(csvText);
    origen = "opex-excel";
  }

  let filasEstimadas = 0;
  let ibarra2Filas = 0;

  await withTransaction(async (client) => {
    await client.query("DELETE FROM cost_rows WHERE origen IN ($1, 'estimado', 'ibarra2')", [origen]);
    await insertar(
      client,
      p.filas.map((r) => ({ ...r, estimado: false, origen })),
    );
    filasEstimadas = await estimar(client, mesActual);
    ibarra2Filas = await ibarra2(client);
  });

  return {
    ok: true,
    formato: esV2 ? "mensual" : "pivot",
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
