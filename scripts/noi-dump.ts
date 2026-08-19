import { Client } from "pg";

// TTM cerrado (2025-08 .. 2026-07): P&L por unidad + estructura media de opex
// para plantilla de underwriting.

const DESDE = "2025-08";
const HASTA = "2026-07";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log("== P&L TTM por unidad (meses cerrados 2025-08..2026-07) ==");
  const pnl = await c.query(
    `WITH rev AS (
       SELECT COALESCE(s.display_name, l.nickname) AS unidad,
              SUM(n.accommodation_eur)::float AS alo,
              SUM(n.cleaning_eur)::float AS limp,
              SUM(n.commission_eur)::float AS com,
              COUNT(*)::int AS noches
       FROM reservation_nights n JOIN listings l ON l.id = n.listing_id
       LEFT JOIN unit_settings s ON s.listing_id = l.id
       WHERE n.mes BETWEEN $1 AND $2 GROUP BY 1
     ), cost AS (
       SELECT cr.unidad AS nick, SUM(cr.importe_eur)::float AS opex,
              SUM(cr.importe_eur) FILTER (WHERE cr.categoria = 'alquiler')::float AS alquiler,
              SUM(cr.importe_eur) FILTER (WHERE cr.categoria = 'limpieza_extra')::float AS limp_cost,
              bool_or(cr.estimado) AS con_est
       FROM cost_rows cr WHERE cr.mes BETWEEN $1 AND $2 GROUP BY 1
     )
     SELECT r.unidad, r.noches, round(r.alo) alo, round(r.limp) limp, round(r.com) com,
            round(COALESCE(c2.opex,0)) opex, round(COALESCE(c2.alquiler,0)) alquiler,
            round(COALESCE(c2.limp_cost,0)) limp_cost,
            round(r.alo + r.limp - r.com - COALESCE(c2.opex,0)) noi,
            COALESCE(c2.con_est,false) AS con_est
     FROM rev r
     LEFT JOIN cost c2 ON c2.nick = (
       SELECT l2.nickname FROM listings l2 LEFT JOIN unit_settings s2 ON s2.listing_id = l2.id
       WHERE COALESCE(s2.display_name, l2.nickname) = r.unidad LIMIT 1
     )
     ORDER BY noi DESC`,
    [DESDE, HASTA],
  );
  for (const r of pnl.rows) {
    const brutos = Number(r.alo) + Number(r.limp);
    const margen = brutos > 0 ? Math.round((Number(r.noi) / brutos) * 100) : 0;
    console.log(
      `${r.unidad}: brutos=${brutos} com=${r.com} opex=${r.opex} (alquiler=${r.alquiler}, limp=${r.limp_cost}) NOI=${r.noi} margen=${margen}%${r.con_est ? " (con est.)" : ""}`,
    );
  }

  console.log("\n== Ratios medios (para plantilla de underwriting) ==");
  const tot = pnl.rows.reduce(
    (a, r) => ({
      alo: a.alo + Number(r.alo), limp: a.limp + Number(r.limp), com: a.com + Number(r.com),
      limpCost: a.limpCost + Number(r.limp_cost),
    }),
    { alo: 0, limp: 0, com: 0, limpCost: 0 },
  );
  console.log("comision / brutos:", ((tot.com / (tot.alo + tot.limp)) * 100).toFixed(1) + "%");
  console.log("comision / alojamiento:", ((tot.com / tot.alo) * 100).toFixed(1) + "%");
  console.log("coste limpieza / ingreso limpieza:", ((tot.limpCost / tot.limp) * 100).toFixed(1) + "%");

  // Opex mensual medio por unidad establecida, sin alquiler ni limpieza (los
  // dos se modelan aparte), por categoria.
  const cats = await c.query(
    `SELECT categoria, round(SUM(importe_eur)::numeric / 12 / 7, 0) AS eur_mes_unidad
     FROM cost_rows
     WHERE mes BETWEEN $1 AND $2
       AND categoria NOT IN ('alquiler','limpieza_extra')
       AND unidad IN ('HeroedeSostoa311306','PIgueldo1090A','PintorCRoldán1C1017','MMenaPalma1B1234','MorenoMasson6','Ibarra','Alférez Beltrán')
     GROUP BY categoria ORDER BY 2 DESC`,
    [DESDE, HASTA],
  );
  console.log("\nOpex mensual medio por unidad establecida (sin alquiler/limpieza):");
  let suma = 0;
  for (const r of cats.rows) { console.log(`  ${r.categoria}: ${r.eur_mes_unidad} EUR/mes`); suma += Number(r.eur_mes_unidad); }
  console.log(`  TOTAL: ~${suma} EUR/mes por unidad`);

  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
