import "server-only";
import { queryOne, withAdvisoryLock, LOCK_KEYS } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Gestor del token de acceso a la Guesty Open API.
 *
 * CRITICO: Guesty solo permite emitir ~5 tokens por dia y clientId, validos 24h.
 * Por eso cacheamos el token en la base de datos y solo pedimos uno nuevo
 * cuando faltan menos de 60 minutos para su expiracion. La renovacion se
 * serializa con un advisory lock de Postgres (single-flight) para que dos
 * invocaciones concurrentes no gasten dos tokens.
 *
 * Nunca se registra (log) el valor del token.
 */

const TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
// Renovar cuando falte menos de esta ventana para expirar.
const REFRESH_BUFFER_MS = 60 * 60 * 1000; // 1 hora
const REQUEST_TIMEOUT_MS = 20_000;

interface TokenRow {
  access_token: string;
  expires_at: Date;
}

interface FreshToken {
  access_token: string;
  token_type: string;
  scope: string | null;
  expires_at: Date;
}

function esValido(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS;
}

async function pedirTokenNuevo(): Promise<FreshToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: env.guestyClientId,
    client_secret: env.guestyClientSecret,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // El cuerpo de error de Guesty no contiene secretos; ayuda a diagnosticar.
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // ignore
    }
    throw new Error(
      `Fallo al obtener token de Guesty (HTTP ${res.status}). ${detail}`,
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };

  if (!json.access_token || !json.expires_in) {
    throw new Error("Respuesta de token de Guesty incompleta.");
  }

  return {
    access_token: json.access_token,
    token_type: json.token_type ?? "Bearer",
    scope: json.scope ?? null,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
  };
}

/**
 * Devuelve un token de acceso valido, reutilizando el cacheado siempre que sea
 * posible. Solo pide uno nuevo dentro de un advisory lock y tras revalidar.
 */
export async function getGuestyAccessToken(): Promise<string> {
  // Camino rapido: token cacheado y aun valido, sin bloquear.
  const cached = await queryOne<TokenRow>(
    "SELECT access_token, expires_at FROM guesty_token WHERE id = 1",
  );
  if (cached && esValido(cached.expires_at)) {
    return cached.access_token;
  }

  // Camino lento: renovacion serializada (single-flight).
  return withAdvisoryLock(LOCK_KEYS.TOKEN_REFRESH, async (client) => {
    // Doble comprobacion: otra invocacion pudo renovarlo mientras esperabamos.
    const { rows } = await client.query<TokenRow>(
      "SELECT access_token, expires_at FROM guesty_token WHERE id = 1",
    );
    const row = rows[0];
    if (row && esValido(row.expires_at)) {
      return row.access_token;
    }

    const fresh = await pedirTokenNuevo();
    await client.query(
      `INSERT INTO guesty_token (id, access_token, token_type, scope, obtained_at, expires_at)
       VALUES (1, $1, $2, $3, now(), $4)
       ON CONFLICT (id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         token_type   = EXCLUDED.token_type,
         scope        = EXCLUDED.scope,
         obtained_at  = now(),
         expires_at   = EXCLUDED.expires_at`,
      [fresh.access_token, fresh.token_type, fresh.scope, fresh.expires_at],
    );
    return fresh.access_token;
  });
}

/**
 * Marca el token cacheado como caducado para forzar una renovacion en la
 * siguiente llamada. Se usa si Guesty devuelve 401 de forma inesperada.
 */
export async function invalidarToken(): Promise<void> {
  await queryOne(
    "UPDATE guesty_token SET expires_at = now() WHERE id = 1 RETURNING id",
  );
}
