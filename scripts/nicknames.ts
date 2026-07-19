import { Client } from "pg";

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(
    "SELECT nickname, active FROM listings ORDER BY nickname",
  );
  await c.end();
  for (const r of rows) console.log(`${r.active ? "[activo]" : "[inact.]"} ${r.nickname}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
