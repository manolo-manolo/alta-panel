/**
 * Ejecuta db/schema.sql contra la base de datos.
 * Uso local:  npm run migrate   (carga .env.local via --env-file)
 * Usa la cadena directa (no pooled) para DDL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Falta DATABASE_URL_UNPOOLED / DATABASE_URL en el entorno.");
  }

  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("Migracion aplicada correctamente.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error en la migracion:", err);
  process.exit(1);
});
