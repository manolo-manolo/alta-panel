import { Client } from "pg";

// Analisis de estacionalidad sobre meses CERRADOS (hasta el mes pasado).
// ADR sin limpieza = alojamiento / noches vendidas.
// ADR con limpieza = (alojamiento + limpieza) / noches vendidas.
// Ocupacion ajustada al inicio real de cada unidad.

const MES_CIERRE = "2026-07"; // ultimo mes completo

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const rows = await c.query<{
    unidad: string;
    mes: string;
    noches: string;
    alo: number;
    limp: number;
  }>(
    `SELECT COALESCE(s.display_name, l.nickname) AS unidad, n.mes,
            COUNT(*) AS noches,
            SUM(n.accommodation_eur)::float AS alo,
            SUM(n.cleaning_eur)::float AS limp
     FROM reservation_nights n
     JOIN listings l ON l.id = n.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     WHERE n.mes <= $1
     GROUP BY unidad, n.mes ORDER BY unidad, n.mes`,
    [MES_CIERRE],
  );

  const avail = await c.query<{ unidad: string; mes: string; disp: string }>(
    `WITH starts AS (
       SELECT l.id AS listing_id,
              COALESCE(s.fecha_inicio,
                       (SELECT MIN(night) FROM reservation_nights n WHERE n.listing_id = l.id)) AS inicio
       FROM listings l LEFT JOIN unit_settings s ON s.listing_id = l.id
     )
     SELECT COALESCE(s.display_name, l.nickname) AS unidad, a.mes,
            COUNT(*) FILTER (WHERE a.is_available) AS disp
     FROM listing_availability a
     JOIN listings l ON l.id = a.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     JOIN starts st ON st.listing_id = a.listing_id
     WHERE a.mes <= $1 AND st.inicio IS NOT NULL AND a.date >= st.inicio
     GROUP BY unidad, a.mes`,
    [MES_CIERRE],
  );
  await c.end();

  const dispMap = new Map<string, number>();
  for (const a of avail.rows) dispMap.set(`${a.unidad}|${a.mes}`, Number(a.disp));

  // Datos por unidad-mes
  interface UM { unidad: string; mes: string; calMes: number; noches: number; alo: number; limp: number; disp: number; }
  const data: UM[] = rows.rows.map((r) => ({
    unidad: r.unidad,
    mes: r.mes,
    calMes: Number(r.mes.slice(5, 7)),
    noches: Number(r.noches),
    alo: r.alo,
    limp: r.limp,
    disp: dispMap.get(`${r.unidad}|${r.mes}`) ?? 0,
  }));

  console.log("== Cobertura de datos por unidad (meses cerrados con ventas) ==");
  const unidades = [...new Set(data.map((d) => d.unidad))].sort();
  for (const u of unidades) {
    const meses = data.filter((d) => d.unidad === u).map((d) => d.mes).sort();
    console.log(`${u}: ${meses.length} meses (${meses[0]} a ${meses[meses.length - 1]})`);
  }

  // Estacionalidad de portfolio por mes calendario (ponderada por noches)
  console.log("\n== Portfolio por mes calendario ==");
  console.log("mes | noches | disp | occ | ADRsin | ADRcon | RevPARsin | RevPARcon");
  const porCal: Record<number, { noches: number; disp: number; alo: number; limp: number }> = {};
  for (const d of data) {
    const p = (porCal[d.calMes] ??= { noches: 0, disp: 0, alo: 0, limp: 0 });
    p.noches += d.noches; p.disp += d.disp; p.alo += d.alo; p.limp += d.limp;
  }
  let totN = 0, totD = 0, totA = 0, totL = 0;
  for (const p of Object.values(porCal)) { totN += p.noches; totD += p.disp; totA += p.alo; totL += p.limp; }
  const adrGlobal = totA / totN;
  const occGlobal = totN / totD;
  for (let m = 1; m <= 12; m++) {
    const p = porCal[m];
    if (!p) { console.log(`${m}: sin datos`); continue; }
    const adr = p.alo / p.noches;
    const adrCon = (p.alo + p.limp) / p.noches;
    const occ = p.noches / p.disp;
    console.log(
      `${String(m).padStart(2, "0")} | ${p.noches} | ${p.disp} | ${(occ * 100).toFixed(1)}% | ${adr.toFixed(0)} | ${adrCon.toFixed(0)} | ${(adr * occ).toFixed(0)} | ${(adrCon * occ).toFixed(0)} | idxADR=${(adr / adrGlobal).toFixed(2)} idxOcc=${(occ / occGlobal).toFixed(2)}`,
    );
  }
  console.log(`\nGlobal: ADRsin=${adrGlobal.toFixed(0)} ADRcon=${((totA + totL) / totN).toFixed(0)} occ=${(occGlobal * 100).toFixed(1)}% noches=${totN}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
