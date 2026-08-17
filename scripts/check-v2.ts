import { Client } from "pg";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log("== Operativo por unidad (opex-v2, 2026-01..06) ==");
  const t = await c.query(
    `SELECT unidad, round(SUM(importe_eur)) AS total FROM cost_rows
     WHERE origen='opex-v2' GROUP BY unidad ORDER BY unidad`,
  );
  for (const r of t.rows) console.log(`${r.unidad}: ${r.total}`);

  console.log("\n== Ibarra 2 alquiler 2026 (debe ser renta Ibarra +80) ==");
  const i2 = await c.query(
    `SELECT mes, concepto, round(importe_eur::numeric,2) AS imp, origen FROM cost_rows
     WHERE unidad='Ibarra 2' AND categoria='alquiler' AND mes >= '2026-01'
     ORDER BY mes LIMIT 8`,
  );
  for (const r of i2.rows) console.log(`${r.mes} ${r.concepto} ${r.imp} (${r.origen})`);

  console.log("\n== Huecos estimados 2025-06..12 (filas por mes) ==");
  const g = await c.query(
    `SELECT mes, count(*)::int AS n, round(SUM(importe_eur)) AS total FROM cost_rows
     WHERE origen='estimado' AND mes BETWEEN '2025-06' AND '2025-12'
     GROUP BY mes ORDER BY mes`,
  );
  for (const r of g.rows) console.log(`${r.mes}: ${r.n} filas, ${r.total} EUR`);

  console.log("\n== Cola estimada 2026-07..08 ==");
  const q = await c.query(
    `SELECT mes, count(*)::int AS n, round(SUM(importe_eur)) AS total FROM cost_rows
     WHERE origen='estimado' AND mes >= '2026-07' GROUP BY mes ORDER BY mes`,
  );
  for (const r of q.rows) console.log(`${r.mes}: ${r.n} filas, ${r.total} EUR`);

  console.log("\n== Doble conteo? meses con real Y estimado misma unidad ==");
  const d = await c.query(
    `SELECT a.unidad, a.mes FROM
       (SELECT DISTINCT unidad, mes FROM cost_rows WHERE origen IN ('opex-excel','opex-v2')) a
     JOIN (SELECT DISTINCT unidad, mes FROM cost_rows WHERE origen='estimado') b
       ON a.unidad=b.unidad AND a.mes=b.mes LIMIT 5`,
  );
  console.log(d.rows.length === 0 ? "ninguno (correcto)" : JSON.stringify(d.rows));

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
