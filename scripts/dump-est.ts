import { createHmac } from "node:crypto";

// Descarga el CSV de estacionalidad del endpoint real y lo imprime, junto con
// el detalle de calculo de Paco Romo y Peña (datos observados y derivacion).
import { Client } from "pg";

async function main() {
  const secret = process.env.SESSION_SECRET!;
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  const res = await fetch("http://localhost:3000/api/estacionalidad", {
    headers: { cookie: `alta_panel_sesion=${payload}.${sig}` },
  });
  console.log("=== CSV (codigo real de la pagina) ===");
  console.log(await res.text());

  // Datos observados crudos de las unidades nuevas
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  console.log("\n=== Observado crudo (meses cerrados) Paco Romo y Peña ===");
  const r = await c.query(
    `SELECT COALESCE(s.display_name, l.nickname) AS unidad, n.mes,
            COUNT(*)::int AS noches,
            round(SUM(n.accommodation_eur)::numeric,2) AS alo,
            round(SUM(n.cleaning_eur)::numeric,2) AS limp
     FROM reservation_nights n
     JOIN listings l ON l.id = n.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     WHERE COALESCE(s.display_name, l.nickname) IN ('Paco Romo','Peña')
     GROUP BY unidad, n.mes ORDER BY unidad, n.mes`,
  );
  for (const x of r.rows) console.log(`${x.unidad} ${x.mes}: ${x.noches} noches, alojamiento ${x.alo}, limpieza ${x.limp}`);

  const d = await c.query(
    `WITH starts AS (
       SELECT l.id AS listing_id,
              COALESCE(s.fecha_inicio, (SELECT MIN(night) FROM reservation_nights n WHERE n.listing_id = l.id)) AS inicio
       FROM listings l LEFT JOIN unit_settings s ON s.listing_id = l.id
     )
     SELECT COALESCE(s.display_name, l.nickname) AS unidad, a.mes,
            COUNT(*) FILTER (WHERE a.is_available)::int AS disp
     FROM listing_availability a
     JOIN listings l ON l.id = a.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     JOIN starts st ON st.listing_id = a.listing_id
     WHERE COALESCE(s.display_name, l.nickname) IN ('Paco Romo','Peña')
       AND a.mes <= '2026-07' AND st.inicio IS NOT NULL AND a.date >= st.inicio
     GROUP BY unidad, a.mes ORDER BY unidad, a.mes`,
  );
  console.log("\n=== Noches disponibles (cerrado, desde inicio real) ===");
  for (const x of d.rows) console.log(`${x.unidad} ${x.mes}: ${x.disp} disponibles`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
