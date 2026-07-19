import { Client } from "pg";

// Nickname Guesty -> nombre a mostrar (confirmado con el usuario).
const PARES: [string, string][] = [
  ["MMenaPalma1B1234", "Benalmádena"],
  ["PintorCRoldán1C1017", "Mendiru"],
  ["HeroedeSostoa311306", "Héroe de Sostoa"],
  ["PIgueldo1090A", "Igueldo"],
  ["MorenoMasson6", "Moreno Masson"],
];

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const [nick, name] of PARES) {
    const r = await c.query(
      `INSERT INTO unit_settings (listing_id, display_name, updated_at)
       SELECT id, $2, now() FROM listings WHERE nickname = $1
       ON CONFLICT (listing_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
       RETURNING listing_id`,
      [nick, name],
    );
    console.log(`${nick} -> ${name}: ${r.rowCount ? "ok" : "listing no encontrado"}`);
  }
  await c.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
