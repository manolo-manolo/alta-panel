import { Client } from "pg";

// Ibarra 2 no tiene Opex propio. Se asume el mismo perfil de costes que Ibarra
// (unidad hermana) con una renta 80 EUR/mes superior. Se marca estimado.

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const idr = await c.query<{ id: string }>("SELECT id FROM listings WHERE nickname = 'Ibarra 2'");
  if (!idr.rows[0]) { console.log("No existe listing 'Ibarra 2'"); await c.end(); return; }
  const ibarra2Id = idr.rows[0].id;

  // Meses activos de Ibarra 2 (con noches vendidas)
  const mesesR = await c.query<{ mes: string }>(
    "SELECT DISTINCT mes FROM reservation_nights WHERE listing_id = $1 ORDER BY mes",
    [ibarra2Id],
  );
  const meses = mesesR.rows.map((r) => r.mes);
  if (meses.length === 0) { console.log("Ibarra 2 sin meses activos"); await c.end(); return; }

  await c.query("DELETE FROM cost_rows WHERE origen = 'ibarra2'");

  let filas = 0;
  for (const mes of meses) {
    // Copia del perfil de Ibarra ese mes
    const src = await c.query<{ categoria: string; concepto: string | null; importe_eur: number }>(
      `SELECT categoria, concepto, importe_eur FROM cost_rows
       WHERE unidad = 'Ibarra' AND mes = $1 AND origen IN ('opex-excel','estimado')`,
      [mes],
    );
    for (const r of src.rows) {
      await c.query(
        `INSERT INTO cost_rows (mes, unidad, categoria, concepto, importe_eur, estimado, origen)
         VALUES ($1,'Ibarra 2',$2,$3,$4,true,'ibarra2')`,
        [mes, r.categoria, r.concepto ? `${r.concepto} (perfil Ibarra)` : "Perfil Ibarra", r.importe_eur],
      );
      filas++;
    }
    // Suplemento de renta +80
    await c.query(
      `INSERT INTO cost_rows (mes, unidad, categoria, concepto, importe_eur, estimado, origen)
       VALUES ($1,'Ibarra 2','alquiler','Suplemento renta (+80)',80,true,'ibarra2')`,
      [mes],
    );
    filas++;
  }

  // unit_settings: master_lease + renta = ultima renta de Ibarra + 80
  const rentaR = await c.query<{ r: number }>(
    `SELECT importe_eur AS r FROM cost_rows
     WHERE unidad = 'Ibarra' AND categoria = 'alquiler' AND origen = 'opex-excel'
     ORDER BY mes DESC LIMIT 1`,
  );
  const renta = (rentaR.rows[0]?.r ?? 1962) + 80;
  await c.query(
    `INSERT INTO unit_settings (listing_id, display_name, tipo, renta_mensual_eur, updated_at)
     VALUES ($1, 'Ibarra 2', 'master_lease', $2, now())
     ON CONFLICT (listing_id) DO UPDATE SET tipo = 'master_lease', renta_mensual_eur = EXCLUDED.renta_mensual_eur, updated_at = now()`,
    [ibarra2Id, renta],
  );

  await c.end();
  console.log(`Ibarra 2: ${filas} filas de coste en ${meses.length} meses. Renta = ${renta} EUR/mes.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
