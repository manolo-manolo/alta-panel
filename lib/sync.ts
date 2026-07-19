import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { VENTANA_MESES_PASADO, VENTANA_MESES_FUTURO } from "@/lib/config";
import {
  mesActualMadrid,
  sumarMeses,
  sumarDias,
} from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/time";
import {
  getGuestyCalendar,
  listGuestyListings,
  listGuestyReservations,
} from "@/lib/guesty/client";
import {
  clasificarDia,
  dividirNoches,
  mapListing,
  mapReservation,
  statusIncluido,
  type ReservationRow,
} from "@/lib/guesty/map";
import { cargarCostes, cargarUnidades, type FilaError } from "@/lib/sheets";

const MUTEX_KEY = "sync_lock";
const MUTEX_STALE_MIN = 15;

export interface SyncResult {
  status: "ok" | "error";
  mode: "full" | "incremental";
  listings: number;
  reservations: number;
  costRows: number;
  errores: FilaError[];
  message?: string;
  finishedAt: string;
}

// --- Mutex de sync basado en fila (compatible con pooler) ---
async function adquirirMutex(): Promise<boolean> {
  const now = new Date();
  const staleIso = new Date(now.getTime() - MUTEX_STALE_MIN * 60_000).toISOString();
  const row = await queryOne<{ key: string }>(
    `INSERT INTO sync_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
     WHERE sync_state.value IS NULL OR sync_state.value < $3
     RETURNING key`,
    [MUTEX_KEY, now.toISOString(), staleIso],
  );
  return row !== null;
}

async function liberarMutex(): Promise<void> {
  await query("UPDATE sync_state SET value = NULL WHERE key = $1", [MUTEX_KEY]);
}

async function getState(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string | null }>(
    "SELECT value FROM sync_state WHERE key = $1",
    [key],
  );
  return row?.value ?? null;
}

async function setState(
  client: PoolClient,
  key: string,
  value: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO sync_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

/** Inserta filas en bloques con placeholders parametrizados. */
async function bulkInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 400,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const row of chunk) {
      const ph: string[] = [];
      for (const val of row) {
        params.push(val);
        ph.push(`$${params.length}`);
      }
      tuples.push(`(${ph.join(",")})`);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`,
      params,
    );
  }
}

const j = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));

// --- Ejecucion principal ---
export async function runSync(opts: {
  kind: "cron" | "manual";
  forceFull?: boolean;
}): Promise<SyncResult> {
  const startedAt = new Date();
  const startIso = startedAt.toISOString();

  const locked = await adquirirMutex();
  if (!locked) {
    return {
      status: "error",
      mode: "incremental",
      listings: 0,
      reservations: 0,
      costRows: 0,
      errores: [],
      message: "Ya hay una sincronizacion en curso.",
      finishedAt: startIso,
    };
  }

  // Ventana movil de fechas.
  const mesActual = mesActualMadrid();
  const windowStart = `${sumarMeses(mesActual, -VENTANA_MESES_PASADO)}-01`;
  const windowEndExcl = `${sumarMeses(mesActual, VENTANA_MESES_FUTURO + 1)}-01`;
  const calendarEnd = sumarDias(windowEndExcl, -1);

  const cursor = await getState("reservations_cursor");
  const isoWeekday = Number(formatInTimeZone(startedAt, TZ, "i")); // 1=lunes
  const mode: "full" | "incremental" =
    opts.forceFull || !cursor || (opts.kind === "cron" && isoWeekday === 1)
      ? "full"
      : "incremental";

  const errores: FilaError[] = [];
  let listingsCount = 0;
  let reservationsCount = 0;
  let costRowsCount = 0;

  try {
    // 1) Listings
    const rawListings = await listGuestyListings();
    const listings = rawListings.map(mapListing);
    listingsCount = listings.length;
    const nicknames = new Set(
      listings.map((l) => l.nickname).filter((n): n is string => !!n),
    );

    await withTransaction(async (client) => {
      for (const l of listings) {
        await client.query(
          `INSERT INTO listings (id, nickname, title, address, active, raw, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6, now())
           ON CONFLICT (id) DO UPDATE SET
             nickname=EXCLUDED.nickname, title=EXCLUDED.title,
             address=EXCLUDED.address, active=EXCLUDED.active,
             raw=EXCLUDED.raw, synced_at=now()`,
          [l.id, l.nickname, l.title, l.address, l.active, j(l.raw)],
        );
      }
    });

    // 2) Reservas (ventana; incremental usa el cursor)
    const rawRes = await listGuestyReservations({
      windowStart,
      windowEnd: windowEndExcl,
      updatedSince: mode === "incremental" ? cursor ?? undefined : undefined,
    });

    const incluidas: ReservationRow[] = [];
    const excluidasIds: string[] = [];
    for (const r of rawRes) {
      if (statusIncluido(r.status)) {
        const mapped = mapReservation(r);
        if (mapped) incluidas.push(mapped);
      } else if (r._id) {
        excluidasIds.push(r._id);
      }
    }
    reservationsCount = incluidas.length;

    await withTransaction(async (client) => {
      // Upsert de reservas incluidas
      for (const r of incluidas) {
        await client.query(
          `INSERT INTO reservations (
             id, listing_id, confirmation_code, status, source, guest_name,
             check_in, check_out, nights, currency,
             accommodation_eur, cleaning_eur, commission_eur, total_payout_eur,
             money, reservation_created_at, last_updated_at, raw, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
           ON CONFLICT (id) DO UPDATE SET
             listing_id=EXCLUDED.listing_id, confirmation_code=EXCLUDED.confirmation_code,
             status=EXCLUDED.status, source=EXCLUDED.source, guest_name=EXCLUDED.guest_name,
             check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, nights=EXCLUDED.nights,
             currency=EXCLUDED.currency, accommodation_eur=EXCLUDED.accommodation_eur,
             cleaning_eur=EXCLUDED.cleaning_eur, commission_eur=EXCLUDED.commission_eur,
             total_payout_eur=EXCLUDED.total_payout_eur, money=EXCLUDED.money,
             reservation_created_at=EXCLUDED.reservation_created_at,
             last_updated_at=EXCLUDED.last_updated_at, raw=EXCLUDED.raw, synced_at=now()`,
          [
            r.id, r.listing_id, r.confirmation_code, r.status, r.source, r.guest_name,
            r.check_in, r.check_out, r.nights, r.currency,
            r.accommodation_eur, r.cleaning_eur, r.commission_eur, r.total_payout_eur,
            j(r.money), r.reservation_created_at, r.last_updated_at, j(r.raw),
          ],
        );
        // Reconstruir noches
        await client.query("DELETE FROM reservation_nights WHERE reservation_id = $1", [r.id]);
        const nights = dividirNoches(r);
        if (nights.length) {
          await bulkInsert(
            client,
            "reservation_nights",
            [
              "reservation_id", "listing_id", "night", "mes", "channel", "status",
              "accommodation_eur", "commission_eur", "cleaning_eur",
            ],
            nights.map((n) => [
              n.reservation_id, n.listing_id, n.night, n.mes, n.channel, n.status,
              n.accommodation_eur, n.commission_eur, n.cleaning_eur,
            ]),
          );
        }
      }

      // Borrar reservas que ahora estan canceladas/excluidas
      if (excluidasIds.length) {
        await client.query("DELETE FROM reservation_nights WHERE reservation_id = ANY($1)", [excluidasIds]);
        await client.query("DELETE FROM reservations WHERE id = ANY($1)", [excluidasIds]);
      }

      // En full refresh, podar reservas antiguas fuera de ventana
      if (mode === "full") {
        await client.query("DELETE FROM reservation_nights WHERE night < $1", [windowStart]);
        await client.query("DELETE FROM reservations WHERE check_out <= $1", [windowStart]);
      }

      // Cursor de incremental: hora de inicio con solape de seguridad de 2 min
      const nuevoCursor = new Date(startedAt.getTime() - 2 * 60_000).toISOString();
      await setState(client, "reservations_cursor", nuevoCursor);
    });

    // 3) Calendario por listing (disponibilidad y bloqueos)
    for (const l of listings) {
      let dias;
      try {
        dias = await getGuestyCalendar(l.id, windowStart, calendarEnd);
      } catch {
        // Un fallo de calendario de un listing no debe abortar el sync.
        continue;
      }
      const filas = dias
        .map((d) => clasificarDia(l.id, d))
        .filter((x): x is NonNullable<typeof x> => x !== null);
      await withTransaction(async (client) => {
        await client.query(
          "DELETE FROM listing_availability WHERE listing_id = $1 AND date BETWEEN $2 AND $3",
          [l.id, windowStart, calendarEnd],
        );
        if (filas.length) {
          await bulkInsert(
            client,
            "listing_availability",
            ["listing_id", "date", "mes", "status", "is_available", "is_blocked", "raw"],
            filas.map((f) => [
              f.listing_id, f.date, f.mes, f.status, f.is_available, f.is_blocked, j(f.raw),
            ]),
          );
        }
      });
    }

    // 4) Hojas de Google (costes y unidades). Solo se reemplaza si se leen bien.
    if (env.costesCsvUrl) {
      try {
        const { rows, errores: errCostes } = await cargarCostes(env.costesCsvUrl, nicknames);
        errores.push(...errCostes);
        costRowsCount = rows.length;
        await withTransaction(async (client) => {
          await client.query("DELETE FROM cost_rows");
          if (rows.length) {
            await bulkInsert(
              client,
              "cost_rows",
              ["mes", "unidad", "categoria", "concepto", "importe_eur"],
              rows.map((r) => [r.mes, r.unidad, r.categoria, r.concepto, r.importe_eur]),
            );
          }
        });
      } catch (err) {
        errores.push({ hoja: "Costes", fila: 0, error: `No se pudo leer la hoja: ${String(err)}`, valores: {} });
      }
    }

    if (env.unidadesCsvUrl) {
      try {
        const { rows, errores: errU } = await cargarUnidades(env.unidadesCsvUrl, nicknames);
        errores.push(...errU);
        await withTransaction(async (client) => {
          await client.query("DELETE FROM units_meta");
          if (rows.length) {
            await bulkInsert(
              client,
              "units_meta",
              ["unidad", "tipo", "coste_total_adquisicion_eur", "renta_mensual_eur", "fecha_inicio"],
              rows.map((r) => [
                r.unidad, r.tipo, r.coste_total_adquisicion_eur,
                r.renta_mensual_eur, r.fecha_inicio,
              ]),
            );
          }
        });
      } catch (err) {
        errores.push({ hoja: "Unidades", fila: 0, error: `No se pudo leer la hoja: ${String(err)}`, valores: {} });
      }
    }

    const finishedAt = new Date();
    const status: SyncResult["status"] = "ok";
    await registrarLog({
      kind: opts.kind, mode, status, startedAt, finishedAt,
      listings: listingsCount, reservations: reservationsCount,
      costRows: costRowsCount, errores,
    });
    await query(
      `INSERT INTO sync_state (key, value) VALUES ('last_success_at', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [finishedAt.toISOString()],
    );

    return {
      status,
      mode,
      listings: listingsCount,
      reservations: reservationsCount,
      costRows: costRowsCount,
      errores,
      finishedAt: finishedAt.toISOString(),
    };
  } catch (err) {
    const finishedAt = new Date();
    const message = err instanceof Error ? err.message : String(err);
    await registrarLog({
      kind: opts.kind, mode, status: "error", startedAt, finishedAt,
      listings: listingsCount, reservations: reservationsCount,
      costRows: costRowsCount, errores, message,
    });
    return {
      status: "error",
      mode,
      listings: listingsCount,
      reservations: reservationsCount,
      costRows: costRowsCount,
      errores,
      message,
      finishedAt: finishedAt.toISOString(),
    };
  } finally {
    await liberarMutex();
  }
}

// registrarLog usa el pool directamente (no requiere client transaccional)
async function registrarLog(
  data: {
    kind: string;
    mode: string;
    status: string;
    startedAt: Date;
    finishedAt: Date;
    listings: number;
    reservations: number;
    costRows: number;
    errores: FilaError[];
    message?: string;
  },
): Promise<void> {
  await query(
    `INSERT INTO sync_log (
       kind, mode, status, started_at, finished_at,
       listings_upserted, reservations_upserted, cost_rows_loaded, row_errors, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      data.kind, data.mode, data.status,
      data.startedAt.toISOString(), data.finishedAt.toISOString(),
      data.listings, data.reservations, data.costRows,
      JSON.stringify(data.errores), data.message ?? null,
    ],
  );
}
