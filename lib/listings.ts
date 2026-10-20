import "server-only";
import { query } from "@/lib/db";

// Datos de apoyo para la auditoria de anuncios (/anuncios).

/** Objeto crudo de Guesty por listing (contenido publico del anuncio). */
export async function contenidoListings(): Promise<Map<string, Record<string, unknown> | null>> {
  const rows = await query<{ id: string; raw: Record<string, unknown> | null }>(
    "SELECT id, raw FROM listings",
  );
  const m = new Map<string, Record<string, unknown> | null>();
  for (const r of rows) m.set(r.id, r.raw);
  return m;
}

/** Reviews historicas por listing: total y media (0-5). */
export async function reviewsHistoricasPorUnidad(): Promise<Map<string, { total: number; media: number | null }>> {
  const rows = await query<{ listing_id: string; total: string; media: number | null }>(
    `SELECT listing_id, COUNT(*) AS total, AVG(rating) FILTER (WHERE rating IS NOT NULL) AS media
     FROM reviews WHERE listing_id IS NOT NULL GROUP BY listing_id`,
  );
  const m = new Map<string, { total: number; media: number | null }>();
  for (const r of rows) m.set(r.listing_id, { total: Number(r.total), media: r.media });
  return m;
}

/** Estancias (reservas con check-in) por listing desde una fecha. */
export async function estanciasPorUnidad(desde: string): Promise<Map<string, number>> {
  const rows = await query<{ listing_id: string; n: string }>(
    `SELECT listing_id, COUNT(*) AS n FROM reservations WHERE check_in >= $1 GROUP BY listing_id`,
    [desde],
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.listing_id, Number(r.n));
  return m;
}
