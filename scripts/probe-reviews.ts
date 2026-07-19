import { Client } from "pg";

async function main() {
  const cs = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!cs) throw new Error("Falta DATABASE_URL(_UNPOOLED)");
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(
    "SELECT access_token, expires_at FROM guesty_token WHERE id = 1",
  );
  await c.end();
  if (!rows[0]) throw new Error("No hay token cacheado");
  const token = rows[0].access_token as string;

  const res = await fetch(
    "https://open-api.guesty.com/v1/reviews?limit=5&includeCustomChannels=true",
    { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
  );
  const j = (await res.json()) as Record<string, unknown>;
  console.log("HTTP", res.status);
  console.log("envelope keys:", Object.keys(j));
  const data = j.data as unknown;
  let arr: unknown[] | null = null;
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    console.log("data keys:", Object.keys(d));
    for (const k of Object.keys(d)) {
      if (Array.isArray(d[k])) arr = d[k] as unknown[];
    }
  }
  if (Array.isArray(j.results)) arr = j.results as unknown[];
  console.log("n:", arr?.length ?? null);
  if (arr && arr[0]) {
    console.log("primer review completo:");
    console.log(JSON.stringify(arr[0], null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
