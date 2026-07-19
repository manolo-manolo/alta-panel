import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runSync } from "@/lib/sync";
import { env } from "@/lib/env";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION, REFRESH_RATE_LIMIT_MIN } from "@/lib/config";
import { query, queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esCron(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  try {
    return auth === `Bearer ${env.cronSecret}`;
  } catch {
    return false;
  }
}

async function sesionValida(): Promise<boolean> {
  const store = await cookies();
  return verificarSesionToken(store.get(COOKIE_SESION)?.value);
}

// Cron (Vercel envia GET con Authorization: Bearer <CRON_SECRET>).
export async function GET(request: Request) {
  if (!esCron(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await runSync({ kind: "cron" });
  return NextResponse.json(result);
}

// Refresco manual desde la UI (requiere sesion). Rate limit de 10 minutos.
export async function POST() {
  if (!(await sesionValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const last = await queryOne<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = 'last_manual_at'",
  );
  if (last?.value) {
    const elapsedMin = (Date.now() - new Date(last.value).getTime()) / 60_000;
    if (elapsedMin < REFRESH_RATE_LIMIT_MIN) {
      const faltan = Math.ceil(REFRESH_RATE_LIMIT_MIN - elapsedMin);
      return NextResponse.json(
        {
          error: `Espera ${faltan} min antes de volver a actualizar.`,
          retryInMin: faltan,
        },
        { status: 429 },
      );
    }
  }

  await query(
    `INSERT INTO sync_state (key, value) VALUES ('last_manual_at', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [new Date().toISOString()],
  );

  const result = await runSync({ kind: "manual" });
  return NextResponse.json(result);
}
