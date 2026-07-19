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

    let calV1: unknown = "sin listing";
    let calSinV1: unknown = "sin listing";
    if (listingId) {
      const cal1 = await jget(
        `${BASE}/availability-pricing-api/calendar/listings/${listingId}?startDate=2026-07-01&endDate=2026-07-07`,
        token,
      );
      calV1 = { status: cal1.status, shape: resumenLista(cal1.body) };
      const cal2 = await jget(
        `https://open-api.guesty.com/availability-pricing-api/calendar/listings/${listingId}?startDate=2026-07-01&endDate=2026-07-07`,
        token,
      );
      calSinV1 = { status: cal2.status, shape: resumenLista(cal2.body) };
    }

    return NextResponse.json({
      reservas_sin_filtro: { status: r1.status, resumen: resumenLista(r1.body), muestra },
      reservas_con_filtro: { status: r2.status, resumen: resumenLista(r2.body) },
      calendario_v1: calV1,
      calendario_sin_v1: calSinV1,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
