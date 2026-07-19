import "server-only";
import { query, queryOne } from "@/lib/db";
import {
  CATEGORIAS_FIJAS,
  CATEGORIAS_VARIABLES,
  CANALES,
  type Canal,
  type TipoUnidad,
} from "@/lib/config";
import {
  hoyMadrid,
  mesActualMadrid,
  meses12,
  mesesYTD,
  sumarDias,
  sumarMeses,
} from "@/lib/time";

const VARIABLES = CATEGORIAS_VARIABLES as unknown as string[];
const FIJAS = CATEGORIAS_FIJAS as unknown as string[];

// --- Tipos ---
export interface UnidadInfo {
  listingId: string;
  nickname: string; // nickname real de Guesty (clave de union con costes)
  displayName: string; // nombre a mostrar (editable)
  activo: boolean;
  tipo: TipoUnidad | null;
  costeAdquisicion: number | null;
  rentaMensual: number | null;
  fechaInicio: string | null;
}

export interface UnidadMes {
  listingId: string;
  nickname: string;
  mes: string;
  vendidas: number;
  disponibles: number;
  bloqueadas: number;
  alojamiento: number;
  limpieza: number;
  brutos: number;
  comisiones: number;
  netos: number;
  costesVariables: number;
  costesFijos: number;
  noi: number;
  ocupacion: number | null;
  adr: number | null;
  revpar: number | null;
  tieneIngresos: boolean;
  tieneCostes: boolean;
  costesPendientes: boolean;
}

interface NightAgg {
  vendidas: number;
  alojamiento: number;
  limpieza: number;
  comisiones: number;
}
interface AvailAgg {
  disponibles: number;
  bloqueadas: number;
}
interface CostAgg {
  variables: number;
  fijas: number;
  filas: number;
}

// --- Catalogo de unidades (listing + metadatos de la hoja) ---
export async function getUnidades(): Promise<UnidadInfo[]> {
  const rows = await query<{
    id: string;
    nickname: string | null;
    active: boolean;
    display_name: string | null;
    tipo: string | null;
    coste: number | null;
    renta: number | null;
    fecha_inicio: string | null;
  }>(
    `SELECT l.id, l.nickname, l.active,
            COALESCE(s.display_name, l.nickname)                              AS display_name,
            COALESCE(s.tipo, u.tipo)                                          AS tipo,
            COALESCE(s.coste_total_adquisicion_eur, u.coste_total_adquisicion_eur) AS coste,
            COALESCE(s.renta_mensual_eur, u.renta_mensual_eur)               AS renta,
            COALESCE(s.fecha_inicio, u.fecha_inicio)                          AS fecha_inicio
     FROM listings l
     LEFT JOIN units_meta u ON u.unidad = l.nickname
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     ORDER BY display_name NULLS LAST`,
  );
  return rows.map((r) => ({
    listingId: r.id,
    nickname: r.nickname ?? "(sin nickname)",
    displayName: r.display_name ?? r.nickname ?? "(sin nombre)",
    activo: r.active,
    tipo: (r.tipo as TipoUnidad | null) ?? null,
    costeAdquisicion: r.coste,
    rentaMensual: r.renta,
    fechaInicio: r.fecha_inicio,
  }));
}

export interface UnitSettingsInput {
  displayName: string | null;
  tipo: TipoUnidad | null;
  costeAdquisicion: number | null;
  rentaMensual: number | null;
  fechaInicio: string | null;
}

/** Guarda (upsert) los ajustes editables de una unidad. */
export async function guardarUnitSettings(
  listingId: string,
  s: UnitSettingsInput,
): Promise<void> {
  await query(
    `INSERT INTO unit_settings
       (listing_id, display_name, tipo, coste_total_adquisicion_eur, renta_mensual_eur, fecha_inicio, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (listing_id) DO UPDATE SET
       display_name=EXCLUDED.display_name, tipo=EXCLUDED.tipo,
       coste_total_adquisicion_eur=EXCLUDED.coste_total_adquisicion_eur,
       renta_mensual_eur=EXCLUDED.renta_mensual_eur,
       fecha_inicio=EXCLUDED.fecha_inicio, updated_at=now()`,
    [
      listingId,
      s.displayName,
      s.tipo,
      s.costeAdquisicion,
      s.rentaMensual,
      s.fechaInicio,
    ],
  );
}

// --- Agregados base por unidad y mes (para un conjunto de meses) ---
async function nightsPorUnidadMes(
  meses: string[],
): Promise<Map<string, NightAgg>> {
  const rows = await query<{
    listing_id: string;
    mes: string;
    vendidas: string;
    alojamiento: number;
    limpieza: number;
    comisiones: number;
  }>(
    `SELECT listing_id, mes,
            COUNT(*) AS vendidas,
            COALESCE(SUM(accommodation_eur),0) AS alojamiento,
            COALESCE(SUM(cleaning_eur),0) AS limpieza,
            COALESCE(SUM(commission_eur),0) AS comisiones
     FROM reservation_nights
     WHERE mes = ANY($1)
     GROUP BY listing_id, mes`,
    [meses],
  );
  const m = new Map<string, NightAgg>();
  for (const r of rows) {
    m.set(`${r.listing_id}|${r.mes}`, {
      vendidas: Number(r.vendidas),
      alojamiento: r.alojamiento,
      limpieza: r.limpieza,
      comisiones: r.comisiones,
    });
  }
  return m;
}

async function availPorUnidadMes(meses: string[]): Promise<Map<string, AvailAgg>> {
  const rows = await query<{
    listing_id: string;
    mes: string;
    disponibles: string;
    bloqueadas: string;
  }>(
    `SELECT listing_id, mes,
            COUNT(*) FILTER (WHERE is_available) AS disponibles,
            COUNT(*) FILTER (WHERE is_blocked) AS bloqueadas
     FROM listing_availability
     WHERE mes = ANY($1)
     GROUP BY listing_id, mes`,
    [meses],
  );
  const m = new Map<string, AvailAgg>();
  for (const r of rows) {
    m.set(`${r.listing_id}|${r.mes}`, {
      disponibles: Number(r.disponibles),
      bloqueadas: Number(r.bloqueadas),
    });
  }
  return m;
}

// Costes vienen por nickname (unidad). Devolvemos map por nickname|mes.
async function costesPorUnidadMes(meses: string[]): Promise<Map<string, CostAgg>> {
  const rows = await query<{
    unidad: string;
    mes: string;
    variables: number;
    fijas: number;
    filas: string;
  }>(
    `SELECT unidad, mes,
            COALESCE(SUM(importe_eur) FILTER (WHERE categoria = ANY($2)),0) AS variables,
            COALESCE(SUM(importe_eur) FILTER (WHERE categoria = ANY($3)),0) AS fijas,
            COUNT(*) AS filas
     FROM cost_rows
     WHERE mes = ANY($1)
     GROUP BY unidad, mes`,
    [meses, VARIABLES, FIJAS],
  );
  const m = new Map<string, CostAgg>();
  for (const r of rows) {
    m.set(`${r.unidad}|${r.mes}`, {
      variables: r.variables,
      fijas: r.fijas,
      filas: Number(r.filas),
    });
  }
  return m;
}

function construirUnidadMes(
  u: UnidadInfo,
  mes: string,
  night: NightAgg | undefined,
  avail: AvailAgg | undefined,
  cost: CostAgg | undefined,
): UnidadMes {
  const alojamiento = night?.alojamiento ?? 0;
  const limpieza = night?.limpieza ?? 0;
  const comisiones = night?.comisiones ?? 0;
  const vendidas = night?.vendidas ?? 0;
  const disponibles = avail?.disponibles ?? 0;
  const bloqueadas = avail?.bloqueadas ?? 0;
  const brutos = alojamiento + limpieza;
  const netos = brutos - comisiones;
  const costesVariables = cost?.variables ?? 0;
  const costesFijos = cost?.fijas ?? 0;
  const noi = netos - costesVariables - costesFijos;
  const tieneIngresos = brutos > 0 || vendidas > 0;
  const tieneCostes = (cost?.filas ?? 0) > 0;
  return {
    listingId: u.listingId,
    nickname: u.nickname,
    mes,
    vendidas,
    disponibles,
    bloqueadas,
    alojamiento,
    limpieza,
    brutos,
    comisiones,
    netos,
    costesVariables,
    costesFijos,
    noi,
    ocupacion: disponibles > 0 ? vendidas / disponibles : null,
    adr: vendidas > 0 ? alojamiento / vendidas : null,
    revpar: disponibles > 0 ? alojamiento / disponibles : null,
    tieneIngresos,
    tieneCostes,
    costesPendientes: tieneIngresos && !tieneCostes,
  };
}

/** Metricas por unidad para un conjunto de meses. Devuelve map listingId|mes. */
export async function unidadMesMap(
  unidades: UnidadInfo[],
  meses: string[],
): Promise<Map<string, UnidadMes>> {
  const [nights, avail, costes] = await Promise.all([
    nightsPorUnidadMes(meses),
    availPorUnidadMes(meses),
    costesPorUnidadMes(meses),
  ]);
  const out = new Map<string, UnidadMes>();
  for (const u of unidades) {
    for (const mes of meses) {
      const key = `${u.listingId}|${mes}`;
      out.set(
        key,
        construirUnidadMes(
          u,
          mes,
          nights.get(key),
          avail.get(key),
          costes.get(`${u.nickname}|${mes}`),
        ),
      );
    }
  }
  return out;
}

// --- Rollups ---
export interface Rollup {
  alojamiento: number;
  limpieza: number;
  brutos: number;
  comisiones: number;
  netos: number;
  costesVariables: number;
  costesFijos: number;
  noi: number;
  vendidas: number;
  disponibles: number;
  bloqueadas: number;
}

export function sumar(items: UnidadMes[]): Rollup {
  const r: Rollup = {
    alojamiento: 0, limpieza: 0, brutos: 0, comisiones: 0, netos: 0,
    costesVariables: 0, costesFijos: 0, noi: 0,
    vendidas: 0, disponibles: 0, bloqueadas: 0,
  };
  for (const it of items) {
    r.alojamiento += it.alojamiento;
    r.limpieza += it.limpieza;
    r.brutos += it.brutos;
    r.comisiones += it.comisiones;
    r.netos += it.netos;
    r.costesVariables += it.costesVariables;
    r.costesFijos += it.costesFijos;
    r.noi += it.noi;
    r.vendidas += it.vendidas;
    r.disponibles += it.disponibles;
    r.bloqueadas += it.bloqueadas;
  }
  return r;
}

export function ocupacionDe(r: Rollup): number | null {
  return r.disponibles > 0 ? r.vendidas / r.disponibles : null;
}
export function adrDe(r: Rollup): number | null {
  return r.vendidas > 0 ? r.alojamiento / r.vendidas : null;
}
export function revparDe(r: Rollup): number | null {
  return r.disponibles > 0 ? r.alojamiento / r.disponibles : null;
}

// --- Serie mensual (para graficos TTM) ---
export interface PuntoMes {
  mes: string;
  noi: number;
  alojamiento: number;
  limpieza: number;
  netos: number;
  ingresos: number; // brutos
}

export function serieMensual(
  map: Map<string, UnidadMes>,
  unidades: UnidadInfo[],
  meses: string[],
): PuntoMes[] {
  return meses.map((mes) => {
    const items = unidades
      .map((u) => map.get(`${u.listingId}|${mes}`))
      .filter((x): x is UnidadMes => !!x);
    const r = sumar(items);
    return {
      mes,
      noi: r.noi,
      alojamiento: r.alojamiento,
      limpieza: r.limpieza,
      netos: r.netos,
      ingresos: r.brutos,
    };
  });
}

// --- Serie de P&L mensual (lineas completas) ---
export interface PnLMes extends Rollup {
  mes: string;
  costesPendientes: boolean;
}

export function seriePnL(
  map: Map<string, UnidadMes>,
  unidades: UnidadInfo[],
  meses: string[],
): PnLMes[] {
  return meses.map((mes) => {
    const items = unidades
      .map((u) => map.get(`${u.listingId}|${mes}`))
      .filter((x): x is UnidadMes => !!x);
    const r = sumar(items);
    const costesPendientes = items.some((it) => it.costesPendientes);
    return { mes, ...r, costesPendientes };
  });
}

// --- Mix de canales ---
export interface MixCanal {
  canal: Canal;
  revenue: number;
  noches: number;
}
export async function mixCanales(
  mes: string,
  listingId?: string,
): Promise<MixCanal[]> {
  const rows = await query<{ channel: string; revenue: number; noches: string }>(
    `SELECT channel,
            COALESCE(SUM(accommodation_eur),0) AS revenue,
            COUNT(*) AS noches
     FROM reservation_nights
     WHERE mes = $1 ${listingId ? "AND listing_id = $2" : ""}
     GROUP BY channel`,
    listingId ? [mes, listingId] : [mes],
  );
  const base = new Map<Canal, MixCanal>();
  for (const c of CANALES) base.set(c, { canal: c, revenue: 0, noches: 0 });
  for (const r of rows) {
    const canal = (CANALES as readonly string[]).includes(r.channel)
      ? (r.channel as Canal)
      : "otros";
    const cur = base.get(canal)!;
    cur.revenue += r.revenue;
    cur.noches += Number(r.noches);
  }
  return [...base.values()];
}

// --- Pacing (proximos 30/60/90 dias vs mismo punto del ano anterior) ---
export interface PacingVentana {
  dias: number;
  noches: number;
  revenue: number;
  nochesLY: number;
  revenueLY: number;
}

async function ventanaNoches(
  desde: string,
  hasta: string,
  listingId?: string,
): Promise<{ noches: number; revenue: number }> {
  const row = await queryOne<{ noches: string; revenue: number }>(
    `SELECT COUNT(*) AS noches, COALESCE(SUM(accommodation_eur),0) AS revenue
     FROM reservation_nights
     WHERE night >= $1 AND night < $2 ${listingId ? "AND listing_id = $3" : ""}`,
    listingId ? [desde, hasta, listingId] : [desde, hasta],
  );
  return { noches: Number(row?.noches ?? 0), revenue: row?.revenue ?? 0 };
}

export async function pacing(listingId?: string): Promise<PacingVentana[]> {
  const hoy = hoyMadrid();
  const hoyLY = sumarDias(hoy, -365);
  const ventanas = [30, 60, 90];
  const out: PacingVentana[] = [];
  for (const dias of ventanas) {
    const actual = await ventanaNoches(hoy, sumarDias(hoy, dias), listingId);
    const ly = await ventanaNoches(hoyLY, sumarDias(hoyLY, dias), listingId);
    out.push({
      dias,
      noches: actual.noches,
      revenue: actual.revenue,
      nochesLY: ly.noches,
      revenueLY: ly.revenue,
    });
  }
  return out;
}

// --- Lead time y estancia media (reservas con check-in en el mes) ---
export interface ReservaStats {
  estanciaMedia: number | null;
  leadTimeMedio: number | null;
}
export async function statsReservas(
  mes: string,
  listingId?: string,
): Promise<ReservaStats> {
  const row = await queryOne<{ estancia: number | null; lead: number | null }>(
    `SELECT AVG(nights) AS estancia,
            AVG(EXTRACT(EPOCH FROM (check_in::timestamptz - reservation_created_at)) / 86400)
              FILTER (WHERE reservation_created_at IS NOT NULL) AS lead
     FROM reservations
     WHERE to_char(check_in, 'YYYY-MM') = $1
       ${listingId ? "AND listing_id = $2" : ""}`,
    listingId ? [mes, listingId] : [mes],
  );
  return {
    estanciaMedia: row?.estancia ?? null,
    leadTimeMedio: row?.lead ?? null,
  };
}

// --- Reservas de un mes para una unidad (drill-down) ---
export interface ReservaLista {
  id: string;
  confirmationCode: string | null;
  guest: string | null;
  source: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  alojamiento: number;
  limpieza: number;
  comision: number;
  payout: number;
}
export async function reservasDelMes(
  listingId: string,
  mes: string,
): Promise<ReservaLista[]> {
  // Reservas cuya estancia toca el mes (alguna noche en el mes).
  const rows = await query<{
    id: string;
    confirmation_code: string | null;
    guest_name: string | null;
    source: string | null;
    check_in: string;
    check_out: string;
    nights: number;
    accommodation_eur: number;
    cleaning_eur: number;
    commission_eur: number;
    total_payout_eur: number;
  }>(
    `SELECT DISTINCT r.id, r.confirmation_code, r.guest_name, r.source,
            r.check_in, r.check_out, r.nights,
            r.accommodation_eur, r.cleaning_eur, r.commission_eur, r.total_payout_eur
     FROM reservations r
     JOIN reservation_nights n ON n.reservation_id = r.id
     WHERE r.listing_id = $1 AND n.mes = $2
     ORDER BY r.check_in`,
    [listingId, mes],
  );
  return rows.map((r) => ({
    id: r.id,
    confirmationCode: r.confirmation_code,
    guest: r.guest_name,
    source: r.source,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    alojamiento: r.accommodation_eur,
    limpieza: r.cleaning_eur,
    comision: r.commission_eur,
    payout: r.total_payout_eur,
  }));
}

// --- Desglose de costes de una unidad y mes ---
export interface CosteDetalle {
  categoria: string;
  concepto: string | null;
  importe: number;
}
export async function costesDetalle(
  nickname: string,
  mes: string,
): Promise<CosteDetalle[]> {
  return query<CosteDetalle>(
    `SELECT categoria, concepto, importe_eur AS importe
     FROM cost_rows
     WHERE unidad = $1 AND mes = $2
     ORDER BY categoria, concepto`,
    [nickname, mes],
  );
}

// --- Reviews ---
export interface ResumenReviews {
  total: number;
  conRating: number;
  cinco: number; // numero de reviews de 5 estrellas
  ratingMedio: number | null; // escala 0-5
  estancias: number; // estancias completadas en el alcance
  pctConReview: number | null; // reviews / estancias
}

export async function resumenReviews(listingId?: string): Promise<ResumenReviews> {
  const cond = listingId ? "WHERE listing_id = $1" : "";
  const params = listingId ? [listingId] : [];
  const r = await queryOne<{
    total: string;
    con_rating: string;
    cinco: string;
    medio: number | null;
  }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE rating IS NOT NULL) AS con_rating,
            count(*) FILTER (WHERE rating >= 4.995) AS cinco,
            avg(rating) FILTER (WHERE rating IS NOT NULL) AS medio
     FROM reviews ${cond}`,
    params,
  );
  const hoy = hoyMadrid();
  const est = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM reservations
     WHERE check_out <= $1 ${listingId ? "AND listing_id = $2" : ""}`,
    listingId ? [hoy, listingId] : [hoy],
  );
  const total = Number(r?.total ?? 0);
  const estancias = Number(est?.n ?? 0);
  return {
    total,
    conRating: Number(r?.con_rating ?? 0),
    cinco: Number(r?.cinco ?? 0),
    ratingMedio: r?.medio ?? null,
    estancias,
    pctConReview: estancias > 0 ? Math.min(1, total / estancias) : null,
  };
}

export interface ReviewNo5 {
  id: string;
  channel: string;
  rating: number | null;
  ratingRaw: number | null;
  ratingScale: number;
  content: string | null;
  fecha: string | null;
  guest: string | null;
  listingId: string | null;
}

/** Todas las reviews que no son de 5 estrellas (rating normalizado < 5). */
export async function reviewsNo5(listingId?: string): Promise<ReviewNo5[]> {
  const rows = await query<{
    id: string;
    channel: string;
    rating: number | null;
    rating_raw: number | null;
    rating_scale: number;
    content: string | null;
    review_date: string | null;
    guest: string | null;
    listing_id: string | null;
  }>(
    `SELECT rv.id, rv.channel, rv.rating, rv.rating_raw, rv.rating_scale,
            rv.content, rv.review_date,
            COALESCE(rv.guest_name, r.guest_name) AS guest,
            rv.listing_id
     FROM reviews rv
     LEFT JOIN reservations r ON r.confirmation_code = rv.reservation_id
     WHERE rv.rating IS NOT NULL AND rv.rating < 4.995
       ${listingId ? "AND rv.listing_id = $1" : ""}
     ORDER BY rv.review_date DESC NULLS LAST`,
    listingId ? [listingId] : [],
  );
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    rating: r.rating,
    ratingRaw: r.rating_raw,
    ratingScale: r.rating_scale,
    content: r.content,
    fecha: r.review_date,
    guest: r.guest,
    listingId: r.listing_id,
  }));
}

// --- Estado de datos (para el banner) ---
export interface EstadoDatos {
  ultimoExito: string | null;
  ultimoLog: {
    kind: string;
    mode: string | null;
    status: string;
    finished_at: string | null;
    message: string | null;
    row_errors: unknown;
  } | null;
}
export async function estadoDatos(): Promise<EstadoDatos> {
  const exito = await queryOne<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = 'last_success_at'",
  );
  const log = await queryOne<EstadoDatos["ultimoLog"]>(
    `SELECT kind, mode, status, finished_at, message, row_errors
     FROM sync_log ORDER BY started_at DESC LIMIT 1`,
  );
  return { ultimoExito: exito?.value ?? null, ultimoLog: log };
}

// --- Utilidades de fechas para las vistas ---
export function mesPorDefecto(): string {
  return mesActualMadrid();
}
export function ttm(mes: string): string[] {
  return meses12(mes);
}
export function ytd(mes: string): string[] {
  return mesesYTD(mes);
}
export function mesPrevio(mes: string): string {
  return sumarMeses(mes, -1);
}
export function mesAnoAnterior(mes: string): string {
  return sumarMeses(mes, -12);
}

// --- NOI TTM y yield/margen por unidad ---
export interface NoiTTM {
  noiTTM: number;
  netosTTM: number;
  yieldPct: number | null; // solo propiedad
  margenPct: number | null; // solo master lease
}
export function noiTTM(
  u: UnidadInfo,
  map: Map<string, UnidadMes>,
  mesesTTM: string[],
): NoiTTM {
  const items = mesesTTM
    .map((mes) => map.get(`${u.listingId}|${mes}`))
    .filter((x): x is UnidadMes => !!x);
  const r = sumar(items);
  const yieldPct =
    u.tipo === "propiedad" && u.costeAdquisicion && u.costeAdquisicion > 0
      ? (r.noi / u.costeAdquisicion) * 100
      : null;
  const margenPct =
    u.tipo === "master_lease" && r.netos !== 0 ? (r.noi / r.netos) * 100 : null;
  return { noiTTM: r.noi, netosTTM: r.netos, yieldPct, margenPct };
}
