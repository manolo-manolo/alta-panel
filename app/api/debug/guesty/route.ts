import { NextResponse } from "next/server";
import { getGuestyAccessToken } from "@/lib/guesty/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://open-api.guesty.com/v1";

async function jget(url: string, token: string) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body };
}

function resumenLista(body: unknown) {
  if (!body || typeof body !== "object") return { tipo: typeof body, body };
  const o = body as Record<string, unknown>;
  const arr = Array.isArray(o.results)
    ? o.results
    : Array.isArray(o.data)
      ? o.data
      : Array.isArray(body)
        ? (body as unknown[])
        : null;
  return {
    keys: Object.keys(o),
    count: o.count,
    total: o.total,
    len: arr?.length ?? null,
  };
}

export async function GET() {
  try {
    const token = await getGuestyAccessToken();

    // 1) Reservas sin filtro
    const r1 = await jget(`${BASE}/reservations?limit=3`, token);
    const arr1 =
      (r1.body as Record<string, unknown>)?.results ??
      (r1.body as Record<string, unknown>)?.data ??
      r1.body;
    const muestra = Array.isArray(arr1)
      ? arr1.slice(0, 3).map((x) => {
          const r = x as Record<string, unknown>;
          return {
            _id: r._id,
            status: r.status,
            source: r.source,
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            moneyKeys: r.money ? Object.keys(r.money as object) : null,
          };
        })
      : null;

    // 2) Reservas con nuestro filtro
    const filters = JSON.stringify([
      { field: "checkOut", operator: "$gt", value: "2024-07-01" },
      { field: "checkIn", operator: "$lt", value: "2027-08-01" },
    ]);
    const r2 = await jget(
      `${BASE}/reservations?limit=3&sort=lastUpdatedAt&filters=${encodeURIComponent(filters)}`,
      token,
    );

    // 3) Un listing para probar calendario
    const lr = await jget(`${BASE}/listings?limit=1&fields=_id nickname`, token);
    const listing = (
      ((lr.body as Record<string, unknown>)?.results as unknown[]) ??
      ((lr.body as Record<string, unknown>)?.data as unknown[]) ??
      []
    )[0] as Record<string, unknown> | undefined;
    const listingId = listing?._id as string | undefined;

    let calendario: unknown = "sin listing";
    if (listingId) {
      const cal = await jget(
        `${BASE}/availability-pricing/api/calendar/listings/${listingId}?startDate=2026-07-01&endDate=2026-07-07`,
        token,
      );
      const body = cal.body as Record<string, unknown>;
      const dias =
        (body?.data as { days?: unknown[] })?.days ??
        (Array.isArray(body?.data) ? (body.data as unknown[]) : null) ??
        (Array.isArray(body?.results) ? (body.results as unknown[]) : null) ??
        (Array.isArray(cal.body) ? (cal.body as unknown[]) : null);
      const primerDia = Array.isArray(dias) ? (dias[0] as Record<string, unknown>) : null;
      calendario = {
        status: cal.status,
        bodyKeys: body ? Object.keys(body) : null,
        nDias: Array.isArray(dias) ? dias.length : null,
        primerDia: primerDia
          ? {
              keys: Object.keys(primerDia),
              date: primerDia.date,
              status: primerDia.status,
              reservationId: primerDia.reservationId,
            }
          : null,
      };
    }

    return NextResponse.json({
      reservas_con_filtro: { status: r2.status, resumen: resumenLista(r2.body) },
      reservas_muestra: muestra,
      calendario,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
