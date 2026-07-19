import { normalizarCanal } from "@/lib/config";
import { mesDe, nochesEntre, toDateStr } from "@/lib/time";
import type {
  GuestyCalendarDay,
  GuestyListing,
  GuestyReservation,
  GuestyReview,
} from "@/lib/guesty/client";

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Estados de reserva que cuentan como estancia real (generan ingreso).
 * Se excluyen canceladas, declinadas, expiradas e inquiries.
 */
export function statusIncluido(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "confirmed" || s === "completed" || s.startsWith("checked");
}

export interface ListingRow {
  id: string;
  nickname: string | null;
  title: string | null;
  address: string | null;
  active: boolean;
  raw: unknown;
}

export function mapListing(l: GuestyListing): ListingRow {
  const address =
    str(l.address) ??
    str((l["address"] as Record<string, unknown> | undefined)?.["full"]) ??
    null;
  return {
    id: l._id,
    nickname: str(l.nickname) ?? str(l.title),
    title: str(l.title),
    address,
    active: l.active !== false,
    raw: l,
  };
}

export interface Money {
  accommodation: number;
  cleaning: number;
  commission: number;
  totalPayout: number;
  currency: string;
}

/**
 * Extrae el desglose economico del objeto money de Guesty.
 * NOTA: "Comisiones de canal" = hostServiceFee (con impuestos si esta presente).
 * Este es el campo a verificar en la reconciliacion euro a euro del E2E.
 */
export function extraerMoney(res: GuestyReservation): Money {
  const m = (res.money ?? {}) as Record<string, unknown>;
  const commission =
    num(m["hostServiceFeeIncTax"]) || num(m["hostServiceFee"]) || num(m["commission"]);
  return {
    accommodation: num(m["fareAccommodation"]),
    cleaning: num(m["fareCleaning"]),
    commission,
    totalPayout: num(m["hostPayout"]),
    currency: (str(m["currency"]) ?? "EUR").toUpperCase(),
  };
}

function guestName(res: GuestyReservation): string | null {
  const g = (res.guest ?? {}) as Record<string, unknown>;
  const full = str(g["fullName"]);
  if (full) return full;
  const fn = str(g["firstName"]);
  const ln = str(g["lastName"]);
  const joined = [fn, ln].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return str((res as Record<string, unknown>)["guestName"]);
}

export interface ReservationRow {
  id: string;
  listing_id: string | null;
  confirmation_code: string | null;
  status: string | null;
  source: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  currency: string;
  accommodation_eur: number;
  cleaning_eur: number;
  commission_eur: number;
  total_payout_eur: number;
  money: unknown;
  reservation_created_at: string | null;
  last_updated_at: string | null;
  raw: unknown;
}

export function mapReservation(res: GuestyReservation): ReservationRow | null {
  if (!res.checkIn || !res.checkOut || !res.listingId) return null;
  const checkIn = toDateStr(res.checkIn);
  const checkOut = toDateStr(res.checkOut);
  const money = extraerMoney(res);
  const nights = res.nightsCount ?? nochesEntre(checkIn, checkOut).length;
  return {
    id: res._id,
    listing_id: res.listingId ?? null,
    confirmation_code: str(res.confirmationCode),
    status: str(res.status),
    source: str(res.source),
    guest_name: guestName(res),
    check_in: checkIn,
    check_out: checkOut,
    nights,
    currency: money.currency,
    accommodation_eur: money.accommodation,
    cleaning_eur: money.cleaning,
    commission_eur: money.commission,
    total_payout_eur: money.totalPayout,
    money: res.money ?? null,
    reservation_created_at: res.createdAt ? String(res.createdAt) : null,
    last_updated_at: res.lastUpdatedAt ? String(res.lastUpdatedAt) : null,
    raw: res,
  };
}

export interface NightRow {
  reservation_id: string;
  listing_id: string;
  night: string;
  mes: string;
  channel: string;
  status: string | null;
  accommodation_eur: number;
  commission_eur: number;
  cleaning_eur: number;
}

/**
 * Divide una reserva en filas por noche.
 * - Ingreso por alojamiento y comision se prorratean a partes iguales por noche.
 * - La limpieza se reconoce integra en la noche de check-in.
 */
export function dividirNoches(r: ReservationRow): NightRow[] {
  const noches = nochesEntre(r.check_in, r.check_out);
  const n = noches.length;
  if (n === 0 || !r.listing_id) return [];
  const accPorNoche = r.accommodation_eur / n;
  const comPorNoche = r.commission_eur / n;
  const channel = normalizarCanal(r.source);
  return noches.map((night, i) => ({
    reservation_id: r.id,
    listing_id: r.listing_id as string,
    night,
    mes: mesDe(night),
    channel,
    status: r.status,
    accommodation_eur: accPorNoche,
    commission_eur: comPorNoche,
    cleaning_eur: i === 0 ? r.cleaning_eur : 0,
  }));
}

// --- Reviews ---
export interface ReviewRow {
  id: string;
  listing_id: string | null;
  reservation_id: string | null; // codigo de confirmacion del canal
  channel: string;
  rating: number | null; // normalizado a 0-5
  rating_raw: number | null;
  rating_scale: number;
  guest_name: string | null;
  content: string | null;
  review_date: string | null;
  raw: unknown;
}

/** Canal legible a partir del channelId de Guesty. */
export function canalReview(channelId: string | null | undefined): string {
  const c = (channelId ?? "").toLowerCase();
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("booking")) return "booking";
  if (c.includes("homeaway") || c.includes("vrbo") || c.includes("expedia")) return "vrbo";
  if (c.includes("custom")) return "directo";
  return "otros";
}

/**
 * Mapea una review de Guesty. Normaliza el rating a escala 0-5
 * (Airbnb/Vrbo ya vienen en 5, Booking en 10). Solo reviews de huesped.
 */
export function mapReview(rev: GuestyReview): ReviewRow | null {
  const rr = (rev.rawReview ?? {}) as Record<string, unknown>;
  // Excluir reviews escritas por el host sobre el huesped.
  const rol = str(rr["reviewer_role"])?.toLowerCase();
  if (rol === "host") return null;

  const channelId = str(rev.channelId);
  const canal = canalReview(channelId);
  const esBooking = (channelId ?? "").toLowerCase().includes("booking");
  const scale = esBooking ? 10 : 5;

  const rawVal = esBooking
    ? num(rr["score"] ?? rr["rating"] ?? rr["average"] ?? rr["reviewScore"])
    : num(rr["overall_rating"] ?? rr["rating"] ?? rr["overallRating"]);
  const ratingRaw = rawVal > 0 ? rawVal : null;
  const rating = ratingRaw === null ? null : scale === 10 ? (ratingRaw / 10) * 5 : ratingRaw;

  const content =
    str(rr["public_review"]) ?? str(rr["publicReview"]) ?? str(rr["comments"]) ?? null;
  const reviewDate = rev.createdAt
    ? String(rev.createdAt)
    : rev.createdAtGuesty
      ? String(rev.createdAtGuesty)
      : null;

  return {
    id: rev._id,
    listing_id: str(rev.listingId),
    reservation_id: str(rev.externalReservationId),
    channel: canal,
    rating,
    rating_raw: ratingRaw,
    rating_scale: scale,
    guest_name: str(rr["reviewer_name"]),
    content,
    review_date: reviewDate,
    raw: rev,
  };
}

export interface AvailabilityRow {
  listing_id: string;
  date: string;
  mes: string;
  status: string | null;
  is_available: boolean;
  is_blocked: boolean;
  raw: unknown;
}

/**
 * Clasifica un dia del calendario:
 * - reservado (tiene reservationId o status booked/reserved) -> disponible, no bloqueado
 * - available -> disponible, no bloqueado
 * - resto (unavailable / bloqueos owner/mantenimiento) -> no disponible, bloqueado
 */
export function clasificarDia(
  listingId: string,
  day: GuestyCalendarDay,
): AvailabilityRow | null {
  if (!day.date) return null;
  const date = toDateStr(day.date);
  const status = str(day.status);
  const s = (status ?? "").toLowerCase();
  const reservado = !!day.reservationId || s === "booked" || s === "reserved";
  let isAvailable: boolean;
  let isBlocked: boolean;
  if (reservado) {
    isAvailable = true;
    isBlocked = false;
  } else if (s === "available") {
    isAvailable = true;
    isBlocked = false;
  } else {
    isAvailable = false;
    isBlocked = true;
  }
  return {
    listing_id: listingId,
    date,
    mes: mesDe(date),
    status,
    is_available: isAvailable,
    is_blocked: isBlocked,
    raw: day,
  };
}
