import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

async function main() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET");
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  const token = `${payload}.${sig}`;

  const csv = readFileSync("C:\\Users\\Manolo Moreno\\Downloads\\Opex Pisos.csv", "utf8");
  const port = process.argv[2] || "3000";
  const res = await fetch(`http://localhost:${port}/api/opex/upload`, {
    method: "POST",
    headers: { "content-type": "text/csv", cookie: `alta_panel_sesion=${token}` },
    body: csv,
  });
  console.log("HTTP", res.status);
  console.log(JSON.stringify(await res.json(), null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
