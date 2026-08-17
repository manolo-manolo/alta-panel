import { Client } from "pg";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    `SELECT mes, count(*)::int AS n, round(sum(importe_eur)) AS t
     FROM cost_rows WHERE origen='estimado' AND mes >= '2026-07'
     GROUP BY mes ORDER BY mes`,
  );
  for (const row of r.rows) console.log(row.mes, row.n, "filas", row.t, "EUR");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
