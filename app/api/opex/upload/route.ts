import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/config";
import { importarOpex } from "@/lib/opex";
import { mesActualMadrid } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const store = await cookies();
  if (!(await verificarSesionToken(store.get(COOKIE_SESION)?.value))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let csv = "";
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (file && typeof file !== "string") csv = await file.text();
    } else {
      csv = await request.text();
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 });
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: "Archivo vacio" }, { status: 400 });
  }

  try {
    const resumen = await importarOpex(csv, mesActualMadrid());
    return NextResponse.json(resumen);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
