import { Client } from "pg";

// Estima costes para meses sin datos (posteriores al ultimo mes real de cada
// unidad, hasta el mes actual). Marca estimado = true.
//
// Regla especial de limpieza: en vez de run-rate plano, la limpieza (limpieza_extra)
// se proyecta proporcional al ingreso de limpieza REAL de ese mes (de Guesty),
// usando la ratio historica coste_limpieza / ingreso_limpieza.

const MES_ACTUAL = "2026-07";

function sumarMeses(mes: string, d: number): string {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + d;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
function rango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let c = desde;
  for (let i = 0; i < 60 && c <= hasta; i++) { out.push(c); c = sumarMeses(c, 1); }
  return out;
}

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows } = await c.query<{ unidad: string; categoria: string; mes: string; importe: number }>(
    `SELECT unidad, categoria, mes, SUM(importe_eur)::float AS importe
     FROM cost_rows WHERE origen = 'opex-excel'
     GROUP BY unidad, categoria, mes`,
  );

  // Ingreso de limpieza real por unidad (nickname) y mes.
  const limpiezaRev = await c.query<{ unidad: string; mes: string; rev: number }>(
    `SELECT l.nickname AS unidad, n.mes, SUM(n.cleaning_eur)::float AS rev
     FROM reservation_nights n JOIN listings l ON l.id = n.listing_id
     GROUP BY l.nickname, n.mes`,
  );
  const revMap: Record<string, number> = {};
  for (const r of limpiezaRev.rows) revMap[`${r.unidad}|${r.mes}`] = r.rev;

  const mesesUnidad: Record<string, Set<string>> = {};
  const totalCat: Record<string, number> = {};
  const limpiezaPorMes: Record<string, Record<string, number>> = {}; // unidad -> mes -> coste limpieza
  for (const r of rows) {
    (mesesUnidad[r.unidad] ??= new Set()).add(r.mes);
    totalCat[`${r.unidad}|${r.categoria}`] = (totalCat[`${r.unidad}|${r.categoria}`] ?? 0) + r.importe;
    if (r.categoria === "limpieza_extra") {
      (limpiezaPorMes[r.unidad] ??= {})[r.mes] = (limpiezaPorMes[r.unidad]?.[r.mes] ?? 0) + r.importe;
    }
  }

  const nuevas: { unidad: string; mes: string; categoria: string; importe: number }[] = [];
  for (const [unidad, meses] of Object.entries(mesesUnidad)) {
    const orden = [...meses].sort();
    const spanMeses = rango(orden[0], orden[orden.length - 1]).length;
    const mesesEstimar = rango(sumarMeses(orden[orden.length - 1], 1), MES_ACTUAL);
    if (mesesEstimar.length === 0) continue;

    // ratio limpieza: coste / ingreso, en meses con ambos datos
    let numer = 0, denom = 0;
    for (const [mes, coste] of Object.entries(limpiezaPorMes[unidad] ?? {})) {
      const rev = revMap[`${unidad}|${mes}`];
      if (rev && rev > 0) { numer += coste; denom += rev; }
    }
    const ratioLimpieza = denom > 0 ? numer / denom : null;

    const cats = new Set(rows.filter((r) => r.unidad === unidad).map((r) => r.categoria));
    for (const categoria of cats) {
      if (categoria === "limpieza_extra" && ratioLimpieza !== null) {
        for (const mes of mesesEstimar) {
          const rev = revMap[`${unidad}|${mes}`] ?? 0;
          const v = ratioLimpieza * rev;
          if (Math.abs(v) >= 0.5) nuevas.push({ unidad, mes, categoria, importe: Math.round(v * 100) / 100 });
        }
      } else {
        const media = (totalCat[`${unidad}|${categoria}`] ?? 0) / spanMeses;
        if (Math.abs(media) < 0.5) continue;
        for (const mes of mesesEstimar) {
          nuevas.push({ unidad, mes, categoria, importe: Math.round(media * 100) / 100 });
        }
      }
    }
  }

  await c.query("DELETE FROM cost_rows WHERE origen = 'estimado'");
  const chunk = 500;
  for (let i = 0; i < nuevas.length; i += chunk) {
    const part = nuevas.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of part) {
      const b = params.length;
      const concepto = r.categoria === "limpieza_extra" ? "Estimado (por ingreso limpieza)" : "Estimado (run-rate)";
      params.push(r.mes, r.unidad, r.categoria, concepto, r.importe, true, "estimado");
      tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
    }
    await c.query(
      `INSERT INTO cost_rows (mes, unidad, categoria, concepto, importe_eur, estimado, origen) VALUES ${tuples.join(",")}`,
      params,
    );
  }
  const s = await c.query("SELECT count(*)::int n, round(sum(importe_eur)) t FROM cost_rows WHERE origen='estimado'");
  await c.end();
  console.log("Filas estimadas:", s.rows[0].n, "suma total:", s.rows[0].t);
}
main().catch((e) => { console.error(e); process.exit(1); });
