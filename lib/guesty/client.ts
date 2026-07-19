import "server-only";
import { getGuestyAccessToken, invalidarToken } from "@/lib/guesty/token";

/**
 * Cliente HTTP de solo lectura para la Guesty Open API.
 * - Anade el token Bearer (cacheado) a cada peticion.
 * - Pagina correctamente (limit/skip).
 * - Respeta rate limits: backoff en 429 y reintentos en 5xx.
 * NUNCA llama a endpoints de escritura (POST/PUT/DELETE).
 */

const BASE_URL = "https://open-api.guesty.com/v1";
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 30_000;

// Guesty devuelve como maximo 100 por pagina.
export const PAGE_SIZE = 100;

export interface GuestyFilter {
  field: string;
  operator: string;
  value?: unknown;
  from?: unknown;
  to?: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface FetchOpts {
  searchParams?: Record<string, string | number | undefined>;
  // reintento interno tras 401
  _retriedAuth?: boolean;
}

async function guestyFetch<T = unknown>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  let attempt = 0;
  // Bucle de reintentos para 429 / 5xx.
  for (;;) {
    attempt++;
    const token = await getGuestyAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      clearTimeout(timeout);
      if (attempt <= MAX_RETRIES) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
        continue;
      }
      throw new Error(`Error de red llamando a Guesty ${path}: ${String(err)}`);
    }
    clearTimeout(timeout);

    // 401: token invalido. Forzamos renovacion una sola vez.
    if (res.status === 401 && !opts._retriedAuth) {
      await invalidarToken();
      return guestyFetch<T>(path, { ...opts, _retriedAuth: true });
    }

    // 429: rate limit. Respetamos Retry-After o backoff exponencial.
    if (res.status === 429 && attempt <= MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * 2 ** (attempt - 1), 16_000);
      await sleep(waitMs);
      continue;
    }

    // 5xx: reintentamos.
    if (res.status >= 500 && attempt <= MAX_RETRIES) {
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 16_000));
      continue;
    }

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        // ignore
      }
      throw new Error(`Guesty ${path} devolvio HTTP ${res.status}. ${detail}`);
    }

    return (await res.json()) as T;
  }
}

// --- Tipos minimos (capturamos el objeto crudo completo aparte) ---
export type GuestyReservation = Record<string, unknown> & {
  _id: string;
  listingId?: string;
  status?: string;
  source?: string;
  checkIn?: string;
  checkOut?: string;
  nightsCount?: number;
  confirmationCode?: string;
  createdAt?: string;
  lastUpdatedAt?: string;
  money?: Record<string, unknown>;
  guest?: Record<string, unknown>;
};

export type GuestyListing = Record<string, unknown> & {
  _id: string;
  nickname?: string;
  title?: string;
  active?: boolean;
};

export type GuestyCalendarDay = Record<string, unknown> & {
  date: string;
  status?: string;
  reservationId?: string;
  blocks?: Record<string, boolean>;
};

interface ListEnvelope<T> {
  results?: T[];
  data?: T[] | { days?: T[] };
  count?: number;
  total?: number;
  limit?: number;
  skip?: number;
}

/** Extrae el array de resultados de las distintas formas de envelope de Guesty. */
function extraerResultados<T>(env: ListEnvelope<T> | T[]): T[] {
  if (Array.isArray(env)) return env;
  if (Array.isArray(env.results)) return env.results;
  if (Array.isArray(env.data)) return env.data;
  if (env.data && Array.isArray((env.data as { days?: T[] }).days)) {
    return (env.data as { days: T[] }).days;
  }
  return [];
}

/** Pagina un endpoint de lista hasta agotar resultados. */
async function paginar<T>(
  path: string,
  baseParams: Record<string, string | number | undefined>,
): Promise<T[]> {
  const out: T[] = [];
  let skip = 0;
  for (;;) {
    const env = await guestyFetch<ListEnvelope<T>>(path, {
      searchParams: { ...baseParams, limit: PAGE_SIZE, skip },
    });
    const page = extraerResultados<T>(env);
    out.push(...page);
    const total = (env as ListEnvelope<T>).total;
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    if (typeof total === "number" && skip >= total) break;
    // Guardia dura para no iterar sin fin.
    if (skip > 100_000) break;
  }
  return out;
}

/** Lista todos los listings. */
export async function listGuestyListings(): Promise<GuestyListing[]> {
  return paginar<GuestyListing>("/listings", {
    fields: "_id nickname title address active",
  });
}

/**
 * Busca reservas cuyo periodo intersecta la ventana [start, end].
 * Si se pasa `updatedSince`, solo devuelve las modificadas despues (incremental).
 */
export async function listGuestyReservations(params: {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string; // YYYY-MM-DD
  updatedSince?: string; // ISO
}): Promise<GuestyReservation[]> {
  const filters: GuestyFilter[] = [
    { field: "checkOut", operator: "$gt", value: params.windowStart },
    { field: "checkIn", operator: "$lt", value: params.windowEnd },
  ];
  if (params.updatedSince) {
    filters.push({
      field: "lastUpdatedAt",
      operator: "$gt",
      value: params.updatedSince,
    });
  }
  return paginar<GuestyReservation>("/reservations", {
    filters: JSON.stringify(filters),
    sort: "lastUpdatedAt",
    // Sin esto, Guesty devuelve una proyeccion minima SIN status/source/money.
    fields:
      "_id listingId confirmationCode status source checkIn checkOut nightsCount createdAt lastUpdatedAt money guest",
  });
}

export type GuestyReview = Record<string, unknown> & {
  _id: string;
  channelId?: string;
  listingId?: string;
  externalReservationId?: string;
  createdAt?: string;
  createdAtGuesty?: string;
  rawReview?: Record<string, unknown>;
};

/** Lista todas las reviews (incluyendo canales personalizados). */
export async function listGuestyReviews(): Promise<GuestyReview[]> {
  return paginar<GuestyReview>("/reviews", { includeCustomChannels: "true" });
}

/** Calendario de un listing entre dos fechas (incluidas). */
export async function getGuestyCalendar(
  listingId: string,
  startDate: string,
  endDate: string,
): Promise<GuestyCalendarDay[]> {
  const env = await guestyFetch<ListEnvelope<GuestyCalendarDay>>(
    `/availability-pricing/api/calendar/listings/${listingId}`,
    { searchParams: { startDate, endDate } },
  );
  return extraerResultados<GuestyCalendarDay>(env);
}
