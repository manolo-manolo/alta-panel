import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION, TIPOS_UNIDAD, type TipoUnidad } from "@/lib/config";
import { guardarUnitSettings } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autenticado(): Promise<boolean> {
  const store = await cookies();
  return verificarSesionToken(store.get(COOKIE_SESION)?.value);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ listingId: string }> },
) {
  if (!(await autenticado())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { listingId } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const tipoRaw = strOrNull(body.tipo);
  const tipo: TipoUnidad | null =
    tipoRaw && (TIPOS_UNIDAD as readonly string[]).includes(tipoRaw)
      ? (tipoRaw as TipoUnidad)
      : null;

  await guardarUnitSettings(listingId, {
    displayName: strOrNull(body.displayName),
    tipo,
    costeAdquisicion: numOrNull(body.costeAdquisicion),
    rentaMensual: numOrNull(body.rentaMensual),
    fechaInicio: strOrNull(body.fechaInicio),
  });

  return NextResponse.json({ ok: true });
}
