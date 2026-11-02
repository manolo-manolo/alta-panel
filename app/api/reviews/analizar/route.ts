import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { analizarPendientes } from "@/lib/review-analysis";
import { env } from "@/lib/env";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Margen bajo el limite de 60 s de la funcion.
const PRESUPUESTO_MS = 45_000;

function esCron(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  try {
    return auth === `Bearer ${env.cronSecret}`;
  } catch {
    return false;
  }
}

// Cron (o llamada interna con el secreto del cron).
export async function GET(request: Request) {
  if (!esCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(await analizarPendientes({ presupuestoMs: PRESUPUESTO_MS }));
}

// Desde la UI (requiere sesion): traduce un lote; la pagina repite mientras queden.
export async function POST() {
  const store = await cookies();
  if (!(await verificarSesionToken(store.get(COOKIE_SESION)?.value))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await analizarPendientes({ presupuestoMs: PRESUPUESTO_MS }));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al analizar reviews" },
      { status: 500 },
    );
  }
}
