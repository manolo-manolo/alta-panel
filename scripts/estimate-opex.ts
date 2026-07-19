import { Client } from "pg";

// Estima costes por run-rate para los meses sin datos (posteriores al ultimo
// mes real de cada unidad, hasta el mes actual). Marca estimado = true.

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

  // spans por unidad y totales por unidad+categoria
  const mesesUnidad: Record<string, Set<string>> = {};
  const totalCat: Record<string, number> = {};
  for (const r of rows) {
    (mesesUnidad[r.unidad] ??= new Set()).add(r.mes);
    totalCat[`${r.unidad}|${r.categoria}`] = (totalCat[`${r.unidad}|${r.categoria}`] ?? 0) + r.importe;
  }

  const nuevas: { unidad: string; mes: string; categoria: string; importe: number }[] = [];
  for (const [unidad, meses] of Object.entries(mesesUnidad)) {
    const orden = [...meses].sort();
    const primero = orden[0];
    const ultimo = orden[orden.length - 1];
    const spanMeses = rango(primero, ultimo).length;
    const mesesEstimar = rango(sumarMeses(ultimo, 1), MES_ACTUAL);
    if (mesesEstimar.length === 0) continue;
    // categorias de esta unidad
    const cats = new Set(rows.filter((r) => r.unidad === unidad).map((r) => r.categoria));
    for (const categoria of cats) {
      const media = (totalCat[`${unidad}|${categoria}`] ?? 0) / spanMeses;
      if (Math.abs(media) < 0.5) continue;
      for (const mes of mesesEstimar) {
        nuevas.push({ unidad, mes, categoria, importe: Math.round(media * 100) / 100 });
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
      params.push(r.mes, r.unidad, r.categoria, "Estimado (run-rate)", r.importe, true, "estimado");
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
  console.log("Meses estimados: de 2025-06 a", MES_ACTUAL);
}
main().catch((e) => { console.error(e); process.exit(1); });
