import { Client } from "pg";

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!cs) throw new Error("Falta DATABASE_URL(_UNPOOLED)");
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const t of [
      "listings",
      "reservations",
      "reservation_nights",
      "listing_availability",
      "cost_rows",
      "units_meta",
    ]) {
      const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`${t}: ${r.rows[0].n}`);
    }
    console.log("\n--- sync_state ---");
    const st = await c.query("SELECT key, value FROM sync_state ORDER BY key");
    for (const row of st.rows) console.log(`${row.key} = ${row.value}`);

    console.log("\n--- ultimos sync_log ---");
    const logs = await c.query(
      `SELECT kind, mode, status, started_at, finished_at,
              listings_upserted, reservations_upserted, cost_rows_loaded,
              jsonb_array_length(row_errors) AS n_errores, message
       FROM sync_log ORDER BY started_at DESC LIMIT 6`,
    );
    for (const l of logs.rows) {
      console.log(
        `[${l.status}] ${l.kind}/${l.mode} listings=${l.listings_upserted} res=${l.reservations_upserted} costes=${l.cost_rows_loaded} errores=${l.n_errores} fin=${l.finished_at}`,
      );
      if (l.message) console.log(`   message: ${l.message}`);
    }
    if (logs.rows.length === 0) console.log("(sin registros de sync)");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
