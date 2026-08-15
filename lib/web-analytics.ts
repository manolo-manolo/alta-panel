import "server-only";
import { createSign } from "node:crypto";
import { env } from "@/lib/env";
import { query } from "@/lib/db";
import { hoyMadrid, sumarDias } from "@/lib/time";

// ---------------------------------------------------------------------------
// Analitica web para la pestana /web.
// Fuentes: Google Analytics 4 (Data API) y Google Search Console, ambas via
// una service account de Google (JWT RS256 firmado con node:crypto, sin
// dependencias nuevas). Ademas, reservas directas de la propia BD (Guesty)
// para el funnel de conversion.
//
// Todo es opcional: si faltan variables de entorno, la pagina muestra la guia
// de conexion. Las respuestas se cachean en memoria (TTL) para no quemar
// cuota de API en cada render.
// ---------------------------------------------------------------------------

export interface WebConfig {
  ga4: boolean;
  gsc: boolean;
}

export function webConfig(): WebConfig {
  const cred = !!(env.googleServiceAccountEmail && env.googleServiceAccountKey);
  return {
    ga4: cred && !!env.ga4PropertyId,
    gsc: cred && !!env.gscSiteUrl,
  };
}

// --- Token OAuth de la service account (cacheado) ---
const SCOPES =
  "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly";

let tokenCache: { token: string; expiraMs: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

async function accessToken(): Promise<string> {
  const ahora = Date.now();
  if (tokenCache && tokenCache.expiraMs - 60_000 > ahora) return tokenCache.token;

  const email = env.googleServiceAccountEmail;
  const key = env.googleServiceAccountKey;
  if (!email || !key) throw new Error("Service account de Google no configurada");

  const iat = Math.floor(ahora / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: email,
      scope: SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const sin = `${header}.${claims}`;
  const firma = createSign("RSA-SHA256").update(sin).sign(key);
  const jwt = `${sin}.${b64url(firma)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google OAuth fallo (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiraMs: ahora + data.expires_in * 1000 };
  return data.access_token;
}

// --- Cache de datos (TTL 30 min) ---
const CACHE_TTL_MS = 30 * 60_000;
const dataCache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = dataCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
  const data = await fn();
  dataCache.set(key, { at: Date.now(), data });
  return data;
}

// --- Llamadas base ---
interface Ga4Row {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

async function ga4Report(body: Record<string, unknown>): Promise<Ga4Row[]> {
  const token = await accessToken();
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${env.ga4PropertyId}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`GA4 fallo (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: Ga4Row[] };
  return data.rows ?? [];
}

interface GscRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

async function gscQuery(body: Record<string, unknown>): Promise<GscRow[]> {
  const token = await accessToken();
  const site = encodeURIComponent(env.gscSiteUrl!);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Search Console fallo (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: GscRow[] };
  return data.rows ?? [];
}

const n = (v: string | undefined) => {
  const x = parseFloat(v ?? "0");
  return Number.isFinite(x) ? x : 0;
};

// --- GA4: totales del periodo actual vs anterior ---
export interface Ga4Totales {
  visitantes: number;
  vistas: number;
  sesiones: number;
  duracionMediaSeg: number;
  visitantesPrev: number;
  vistasPrev: number;
  sesionesPrev: number;
}

export async function ga4Totales(dias: number): Promise<Ga4Totales> {
  return cached(`ga4tot|${dias}`, async () => {
    const rows = await ga4Report({
      dateRanges: [
        { startDate: `${dias - 1}daysAgo`, endDate: "today" },
        { startDate: `${dias * 2 - 1}daysAgo`, endDate: `${dias}daysAgo` },
      ],
      metrics: [
        { name: "activeUsers" },
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "averageSessionDuration" },
      ],
    });
    const out: Ga4Totales = {
      visitantes: 0, vistas: 0, sesiones: 0, duracionMediaSeg: 0,
      visitantesPrev: 0, vistasPrev: 0, sesionesPrev: 0,
    };
    for (const r of rows) {
      const rango = r.dimensionValues?.[0]?.value ?? "date_range_0";
      const m = r.metricValues ?? [];
      if (rango === "date_range_0") {
        out.visitantes = n(m[0]?.value);
        out.vistas = n(m[1]?.value);
        out.sesiones = n(m[2]?.value);
        out.duracionMediaSeg = n(m[3]?.value);
      } else {
        out.visitantesPrev = n(m[0]?.value);
        out.vistasPrev = n(m[1]?.value);
        out.sesionesPrev = n(m[2]?.value);
      }
    }
    return out;
  });
}

// --- GA4: serie diaria de visitantes ---
export interface PuntoVisitas {
  fecha: string; // YYYY-MM-DD
  visitantes: number;
  vistas: number;
}

export async function ga4Serie(dias: number): Promise<PuntoVisitas[]> {
  return cached(`ga4serie|${dias}`, async () => {
    const rows = await ga4Report({
      dateRanges: [{ startDate: `${dias - 1}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 400,
    });
    return rows.map((r) => {
      const d = r.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
      return {
        fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        visitantes: n(r.metricValues?.[0]?.value),
        vistas: n(r.metricValues?.[1]?.value),
      };
    });
  });
}

// --- GA4: paginas mas vistas ---
export interface PaginaTop {
  path: string;
  titulo: string;
  vistas: number;
  visitantes: number;
}

export async function ga4TopPaginas(dias: number, limit = 15): Promise<PaginaTop[]> {
  return cached(`ga4top|${dias}|${limit}`, async () => {
    const rows = await ga4Report({
      dateRanges: [{ startDate: `${dias - 1}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit,
    });
    return rows.map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "",
      titulo: r.dimensionValues?.[1]?.value ?? "",
      vistas: n(r.metricValues?.[0]?.value),
      visitantes: n(r.metricValues?.[1]?.value),
    }));
  });
}

// --- GA4: dimensiones simples (canal, pais, dispositivo) ---
export interface DimValor {
  nombre: string;
  visitantes: number;
  sesiones: number;
}

async function ga4Dimension(dias: number, dimension: string, limit: number): Promise<DimValor[]> {
  return cached(`ga4dim|${dimension}|${dias}|${limit}`, async () => {
    const rows = await ga4Report({
      dateRanges: [{ startDate: `${dias - 1}daysAgo`, endDate: "today" }],
      dimensions: [{ name: dimension }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit,
    });
    return rows.map((r) => ({
      nombre: r.dimensionValues?.[0]?.value ?? "",
      visitantes: n(r.metricValues?.[0]?.value),
      sesiones: n(r.metricValues?.[1]?.value),
    }));
  });
}

export const ga4Canales = (dias: number) => ga4Dimension(dias, "sessionDefaultChannelGroup", 8);
export const ga4Paises = (dias: number) => ga4Dimension(dias, "country", 8);
export const ga4Dispositivos = (dias: number) => ga4Dimension(dias, "deviceCategory", 4);

// --- GA4: eventos (para detectar reservas y clics de salida a OTAs) ---
export interface EventoConteo {
  nombre: string;
  conteo: number;
}

export async function ga4Eventos(dias: number): Promise<EventoConteo[]> {
  return cached(`ga4ev|${dias}`, async () => {
    const rows = await ga4Report({
      dateRanges: [{ startDate: `${dias - 1}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 40,
    });
    return rows.map((r) => ({
      nombre: r.dimensionValues?.[0]?.value ?? "",
      conteo: n(r.metricValues?.[0]?.value),
    }));
  });
}

/** Eventos que indican intencion/conversion de reserva o salida a OTA. */
export function eventosDeReserva(eventos: EventoConteo[]): EventoConteo[] {
  const claves = [
    "purchase", "reserv", "book", "begin_checkout", "add_to_cart",
    "generate_lead", "outbound", "click_out", "airbnb", "booking",
  ];
  return eventos.filter((e) =>
    claves.some((k) => e.nombre.toLowerCase().includes(k)),
  );
}

// --- Search Console ---
export interface PuntoGsc {
  fecha: string;
  clicks: number;
  impresiones: number;
}

export async function gscSerie(dias: number): Promise<PuntoGsc[]> {
  return cached(`gscserie|${dias}`, async () => {
    const hoy = hoyMadrid();
    const rows = await gscQuery({
      startDate: sumarDias(hoy, -dias + 1),
      endDate: hoy,
      dimensions: ["date"],
      rowLimit: 400,
    });
    return rows
      .map((r) => ({
        fecha: r.keys?.[0] ?? "",
        clicks: r.clicks,
        impresiones: r.impressions,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  });
}

export interface GscPagina {
  url: string;
  clicks: number;
  impresiones: number;
  ctr: number;
  posicion: number;
}

export async function gscTopPaginas(dias: number, limit = 15): Promise<GscPagina[]> {
  return cached(`gsctop|${dias}|${limit}`, async () => {
    const hoy = hoyMadrid();
    const rows = await gscQuery({
      startDate: sumarDias(hoy, -dias + 1),
      endDate: hoy,
      dimensions: ["page"],
      rowLimit: limit,
    });
    return rows.map((r) => ({
      url: r.keys?.[0] ?? "",
      clicks: r.clicks,
      impresiones: r.impressions,
      ctr: r.ctr,
      posicion: r.position,
    }));
  });
}

export interface GscConsulta {
  consulta: string;
  clicks: number;
  impresiones: number;
  ctr: number;
  posicion: number;
}

export async function gscTopConsultas(dias: number, limit = 12): Promise<GscConsulta[]> {
  return cached(`gscq|${dias}|${limit}`, async () => {
    const hoy = hoyMadrid();
    const rows = await gscQuery({
      startDate: sumarDias(hoy, -dias + 1),
      endDate: hoy,
      dimensions: ["query"],
      rowLimit: limit,
    });
    return rows.map((r) => ({
      consulta: r.keys?.[0] ?? "",
      clicks: r.clicks,
      impresiones: r.impressions,
      ctr: r.ctr,
      posicion: r.position,
    }));
  });
}

// --- Reservas directas de la BD (para el funnel) ---
export interface ReservasDirectas {
  creadas: number; // reservas directas creadas en la ventana
  creadasPrev: number; // en la ventana anterior equivalente
  revenue: number; // alojamiento de las creadas en la ventana
}

export async function reservasDirectas(dias: number): Promise<ReservasDirectas> {
  const hoy = hoyMadrid();
  const desde = sumarDias(hoy, -dias + 1);
  const desdePrev = sumarDias(hoy, -dias * 2 + 1);
  const rows = await query<{ periodo: string; reservas: string; revenue: number }>(
    `SELECT CASE WHEN r.reservation_created_at >= $1::date THEN 'act' ELSE 'prev' END AS periodo,
            COUNT(DISTINCT r.id) AS reservas,
            COALESCE(SUM(r.accommodation_eur) FILTER (WHERE r.reservation_created_at >= $1::date), 0) AS revenue
     FROM reservations r
     WHERE r.reservation_created_at >= $2::date
       AND EXISTS (
         SELECT 1 FROM reservation_nights nn
         WHERE nn.reservation_id = r.id AND nn.channel = 'directo'
       )
     GROUP BY 1`,
    [desde, desdePrev],
  );
  const out: ReservasDirectas = { creadas: 0, creadasPrev: 0, revenue: 0 };
  for (const r of rows) {
    if (r.periodo === "act") {
      out.creadas = Number(r.reservas);
      out.revenue = r.revenue;
    } else {
      out.creadasPrev = Number(r.reservas);
    }
  }
  return out;
}

/** Reservas directas creadas en la ventana, por unidad (para atribuir fichas). */
export async function reservasDirectasPorUnidad(
  dias: number,
): Promise<Map<string, number>> {
  const hoy = hoyMadrid();
  const desde = sumarDias(hoy, -dias + 1);
  const rows = await query<{ listing_id: string; reservas: string }>(
    `SELECT r.listing_id, COUNT(DISTINCT r.id) AS reservas
     FROM reservations r
     WHERE r.reservation_created_at >= $1::date
       AND EXISTS (
         SELECT 1 FROM reservation_nights nn
         WHERE nn.reservation_id = r.id AND nn.channel = 'directo'
       )
     GROUP BY r.listing_id`,
    [desde],
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.listing_id, Number(r.reservas));
  return m;
}

// --- Deteccion de paginas de apartamento ---
const SEGMENTOS_LISTADO = [
  "apartament", "apartment", "property", "properties", "listing",
  "alojamiento", "unidad", "piso", "rental",
];

/** Normaliza un nombre a slug para compararlo con paths. */
export function slugUnidad(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Heuristica: el path parece la ficha de un apartamento. */
export function esPaginaApartamento(path: string, nombresUnidades: string[]): boolean {
  const p = path.toLowerCase();
  if (SEGMENTOS_LISTADO.some((s) => p.includes(s))) return true;
  return nombresUnidades.some((nombre) => {
    const sl = slugUnidad(nombre);
    return sl.length >= 4 && p.includes(sl);
  });
}
