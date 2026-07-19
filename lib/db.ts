import "server-only";
import { Pool, type PoolClient, types } from "pg";
import { env } from "@/lib/env";

// NUMERIC (oid 1700): parse to JS number. Portfolio magnitudes are small, so
// float precision is not a concern and downstream math is far simpler.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// DATE (oid 1082): keep as 'YYYY-MM-DD' string to avoid timezone shifts.
types.setTypeParser(1082, (v) => v);

function makePool(): Pool {
  const connectionString = env.databaseUrl;
  return new Pool({
    connectionString,
    // Neon requires TLS. rejectUnauthorized:false keeps it robust across
    // platforms without shipping a CA bundle; the endpoint is still encrypted.
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Reuse a single pool across hot reloads / lambda invocations.
// Lazy: the pool (and thus DATABASE_URL) is only touched on first use, never
// at import time, so `next build` can collect page data without the env var.
const globalForPool = globalThis as unknown as { __altaPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__altaPool) {
    globalForPool.__altaPool = makePool();
  }
  return globalForPool.__altaPool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await getPool().query(text, params as never[]);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run `fn` inside a transaction, committing on success and rolling back on error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transaction-scoped advisory lock. Compatible with PgBouncer transaction
 * pooling (Neon). The lock is automatically released at COMMIT/ROLLBACK.
 * Use distinct integer keys per critical section.
 */
export const LOCK_KEYS = {
  TOKEN_REFRESH: 4711,
  SYNC: 4712,
} as const;

export async function withAdvisoryLock<T>(
  key: number,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [key]);
    return fn(client);
  });
}
