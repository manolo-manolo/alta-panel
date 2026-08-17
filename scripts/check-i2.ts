import { Client } from "pg";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log("== Ingresos Ibarra 2 por mes (Guesty) y payout registrado ==");
  const r = await c.query(
    `WITH rev AS (
       SELECT n.mes,
              SUM(n.accommodation_eur)::float AS alo,
              SUM(n.cleaning_eur)::float AS limp,
              SUM(n.commission_eur)::float AS com
       FROM reservation_nights n JOIN listings l ON l.id = n.listing_id
       WHERE l.nickname = 'Ibarra 2' GROUP BY n.mes
     ), pay AS (
       SELECT mes, SUM(importe_eur)::float AS payout
       FROM cost_rows WHERE unidad='Ibarra 2' AND categoria='alquiler'
       GROUP BY mes
     )
     SELECT rev.mes, round(rev.alo::numeric,2) alo, round(rev.limp::numeric,2) limp,
            round(rev.com::numeric,2) com, round(pay.payout::numeric,2) payout,
            round((0.75*(rev.alo - rev.com*rev.alo/NULLIF(rev.alo+rev.limp,0)))::numeric,2) esperado
     FROM rev LEFT JOIN pay ON pay.mes = rev.mes
     ORDER BY rev.mes DESC LIMIT 8`,
  );
  for (const x of r.rows) {
    console.log(`${x.mes} alo=${x.alo} limp=${x.limp} com=${x.com} payout=${x.payout} esperado=${x.esperado}`);
  }

  console.log("\n== unit_settings Ibarra 2 ==");
  const s = await c.query(
    `SELECT s.tipo, s.renta_mensual_eur FROM unit_settings s
     JOIN listings l ON l.id = s.listing_id WHERE l.nickname='Ibarra 2'`,
  );
  console.log(JSON.stringify(s.rows[0]));
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
