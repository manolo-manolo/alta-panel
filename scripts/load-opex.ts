import { readFileSync } from "node:fs";
import { Client } from "pg";

// ---------- CSV ----------
function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let field = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function num(cell: string): number {
  const s = (cell ?? "").replace(/["€\s]/g, "").replace(/,/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// ---------- Mapeo de categorias ----------
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
const COMISION = ["comision", "tarifa servicio"];
const CAPEX = ["amortizacion", "montaje", "reforma", "notaria", "registro",
  "retirada muebles", "extraordinari", "okupas", "certificado de dominio"];
const MAPEO: [string, string][] = [
  ["renta mensual", "alquiler"], ["comunidad", "comunidad"], ["ibi", "ibi_tasas"],
  ["tasa basura", "ibi_tasas"], ["basura", "ibi_tasas"], ["seguridad", "seguros"],
  ["seguro", "seguros"], ["limpieza", "limpieza_extra"], ["lavanderia", "limpieza_extra"],
  ["mantenimiento", "mantenimiento"], ["reparacion", "mantenimiento"], ["ferreteria", "mantenimiento"],
  ["energia electrica", "suministros"], ["electrica", "suministros"], ["agua", "suministros"],
  ["wifi", "suministros"], ["guesty", "gestion"], ["pricelabs", "gestion"], ["hostai", "gestion"],
  ["chekin", "gestion"], ["nuki", "gestion"], ["smart hosting", "gestion"], ["home sensor", "gestion"],
  ["amenities", "otros"], ["reposicion", "otros"], ["trona", "otros"], ["cuna", "otros"],
  ["muletas", "otros"], ["cafetera", "otros"], ["compras", "otros"], ["recogida", "otros"],
  ["varios", "otros"], ["otros", "otros"],
];
function mapCat(raw: string): { categoria: string | null; excluir: string | null } {
  const n = norm(raw);
  if (COMISION.some((k) => n.includes(k))) return { categoria: null, excluir: "comision" };
  if (CAPEX.some((k) => n.includes(k))) return { categoria: null, excluir: "capex" };
  for (const [k, cat] of MAPEO) if (n.includes(k)) return { categoria: cat, excluir: null };
  return { categoria: null, excluir: null };
}

const UNIT_MAP: Record<string, string> = {
  "Benalmádena": "MMenaPalma1B1234",
  "General": "__GENERAL__",
  "Héroe de Sostoa": "HeroedeSostoa311306",
  "Igueldo": "PIgueldo1090A",
  "Mendiru": "PintorCRoldán1C1017",
  "Ibarra": "Ibarra",
  "Moreno Masson": "MorenoMasson6",
  "Capuchinos": "__EXCLUDE__",
  "Alferez Beltran": "Alférez Beltrán",
};

interface Row { unidad: string; mes: string; categoria: string; concepto: string; importe: number; }

async function main() {
  const path = process.argv[2] || "C:\\Users\\Manolo Moreno\\Downloads\\Opex Pisos.csv";
  const rows = parseCsv(readFileSync(path, "utf8"));

  // localizar cabecera y construir columnas -> mes
  const hIdx = rows.findIndex((r) => (r[0] ?? "").trim() === "Row Labels");
  if (hIdx < 0) throw new Error("No encuentro la fila de cabecera 'Row Labels'");
  const monthCols: { col: number; mes: string }[] = [];
  for (let m = 1; m <= 12; m++) monthCols.push({ col: m, mes: `2023-${String(m).padStart(2, "0")}` });
  for (let m = 1; m <= 12; m++) monthCols.push({ col: 13 + m, mes: `2024-${String(m).padStart(2, "0")}` });
  for (let m = 1; m <= 5; m++) monthCols.push({ col: 26 + m, mes: `2025-${String(m).padStart(2, "0")}` });

  const out: Row[] = [];
  const general: Record<string, number> = {};
  const excl: Record<string, number> = { comision: 0, capex: 0, capuchinos: 0 };
  const unmapped = new Set<string>();
  let grandParsed = 0;

  let unit: string | null = null;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const label = (rows[i][0] ?? "").trim();
    if (label === "" ) continue;
    if (label === "Grand Total") break;
    if (label in UNIT_MAP) {
      unit = UNIT_MAP[label];
      if (unit === "__GENERAL__") {
        for (const { col, mes } of monthCols) {
          const v = num(rows[i][col]); if (v) { general[mes] = (general[mes] ?? 0) + v; grandParsed += v; }
        }
      }
      continue;
    }
    // fila de categoria
    if (!unit || unit === "__GENERAL__") continue;
    const m = mapCat(label);
    for (const { col, mes } of monthCols) {
      const v = num(rows[i][col]);
      if (!v) continue;
      grandParsed += v;
      if (unit === "__EXCLUDE__") { excl.capuchinos += v; continue; }
      if (m.excluir) { excl[m.excluir] += v; continue; }
      if (!m.categoria) { unmapped.add(label); continue; }
      out.push({ unidad: unit, mes, categoria: m.categoria, concepto: label, importe: v });
    }
  }

  // Reparto de General proporcional al coste operativo de cada unidad ese mes
  const costeUnidadMes: Record<string, Record<string, number>> = {};
  for (const r of out) {
    (costeUnidadMes[r.mes] ??= {});
    costeUnidadMes[r.mes][r.unidad] = (costeUnidadMes[r.mes][r.unidad] ?? 0) + r.importe;
  }
  let generalRepartido = 0;
  for (const [mes, total] of Object.entries(general)) {
    const porUnidad = costeUnidadMes[mes] ?? {};
    const suma = Object.values(porUnidad).reduce((a, b) => a + b, 0);
    if (suma <= 0) continue;
    for (const [u, c] of Object.entries(porUnidad)) {
      const v = (total * c) / suma;
      out.push({ unidad: u, mes, categoria: "gestion", concepto: "General (prorrateado)", importe: v });
      generalRepartido += v;
    }
  }

  const loadedOperating = out.reduce((a, r) => a + r.importe, 0);

  console.log("=== VALIDACION ===");
  console.log("Grand Total parseado:", Math.round(grandParsed), "(esperado ~200.497)");
  console.log("Excluido comisiones de canal:", Math.round(excl.comision));
  console.log("Excluido capex:", Math.round(excl.capex));
  console.log("Excluido Capuchinos (no operativa):", Math.round(excl.capuchinos));
  console.log("General total:", Math.round(Object.values(general).reduce((a, b) => a + b, 0)),
    "-> repartido:", Math.round(generalRepartido));
  console.log("Coste operativo cargado (con General):", Math.round(loadedOperating));
  if (unmapped.size) console.log("Categorias SIN mapear (revisar):", [...unmapped]);

  // Totales operativos por unidad y anio
  const porUnidadAnio: Record<string, Record<string, number>> = {};
  for (const r of out) {
    const y = r.mes.slice(0, 4);
    (porUnidadAnio[r.unidad] ??= {});
    porUnidadAnio[r.unidad][y] = (porUnidadAnio[r.unidad][y] ?? 0) + r.importe;
  }
  console.log("\n=== Coste operativo por unidad y anio ===");
  for (const [u, ys] of Object.entries(porUnidadAnio)) {
    console.log(u, Object.fromEntries(Object.entries(ys).map(([y, v]) => [y, Math.round(v)])));
  }

  // Cargar en BD
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("DELETE FROM cost_rows WHERE origen = 'opex-excel'");
  const chunk = 500;
  for (let i = 0; i < out.length; i += chunk) {
    const part = out.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of part) {
      const base = params.length;
      params.push(r.mes, r.unidad, r.categoria, r.concepto, Math.round(r.importe * 100) / 100, false, "opex-excel");
      tuples.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`);
    }
    await c.query(
      `INSERT INTO cost_rows (mes, unidad, categoria, concepto, importe_eur, estimado, origen) VALUES ${tuples.join(",")}`,
      params,
    );
  }
  const cnt = await c.query("SELECT count(*)::int n, round(sum(importe_eur)) s FROM cost_rows WHERE origen='opex-excel'");
  await c.end();
  console.log("\nFilas cargadas en cost_rows:", cnt.rows[0].n, "suma:", cnt.rows[0].s);
}

main().catch((e) => { console.error(e); process.exit(1); });
