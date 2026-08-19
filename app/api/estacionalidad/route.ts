import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/config";
import { calcularEstacionalidad } from "@/lib/seasonality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES_L = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function n(v: number | null, dec = 2): string {
  return v === null ? "" : v.toFixed(dec);
}

export async function GET() {
  const store = await cookies();
  if (!(await verificarSesionToken(store.get(COOKIE_SESION)?.value))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const est = await calcularEstacionalidad();
  const lineas: string[] = [];
  lineas.push(
    [
      "unidad", "mes", "ocupacion", "adr_sin_limpieza", "adr_con_limpieza",
      "revpar_sin_limpieza", "revpar_con_limpieza", "indice_adr", "indice_occ",
      "estimado", "observaciones",
    ].join(","),
  );

  const filasDe = (u: typeof est.portfolio) => {
    for (const m of u.meses) {
      const idx = est.indices[m.calMes - 1];
      lineas.push(
        [
          `"${u.nombre}"`, MESES_L[m.calMes - 1], n(m.occ, 4), n(m.adrSin), n(m.adrCon),
          n(m.revparSin), n(m.revparCon), n(idx?.idxAdr ?? null), n(idx?.idxOcc ?? null),
          m.fuente, String(m.nObs),
        ].join(","),
      );
    }
    lineas.push(
      [
        `"${u.nombre}"`, "ano_completo", n(u.ano.occ, 4), n(u.ano.adrSin), n(u.ano.adrCon),
        n(u.ano.revparSin), n(u.ano.revparCon), "", "",
        u.ano.algunEstimado ? "parcial" : "no", "",
      ].join(","),
    );
  };

  filasDe(est.portfolio);
  for (const u of est.unidades) filasDe(u);

  return new NextResponse(lineas.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="estacionalidad-altahomes-${est.cierre}.csv"`,
    },
  });
}
