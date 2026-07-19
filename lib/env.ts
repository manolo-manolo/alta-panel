import "server-only";

/**
 * Central, server-only access to environment variables.
 *
 * Values are read lazily so that a missing variable only throws when the
 * feature that needs it actually runs (this keeps `next build` from crashing
 * when, for example, Guesty credentials are not present in the build env).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Falta la variable de entorno obligatoria: ${name}. ` +
        `Configurala en .env.local (local) o en Vercel (produccion).`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

export const env = {
  // Database
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get databaseUrlUnpooled() {
    return optional("DATABASE_URL_UNPOOLED") ?? required("DATABASE_URL");
  },

  // Guesty
  get guestyClientId() {
    return required("GUESTY_CLIENT_ID");
  },
  get guestyClientSecret() {
    return required("GUESTY_CLIENT_SECRET");
  },

  // Auth
  get dashboardPassword() {
    return required("DASHBOARD_PASSWORD");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },

  // Cron
  get cronSecret() {
    return required("CRON_SECRET");
  },

  // Google Sheet CSVs
  get costesCsvUrl() {
    return optional("COSTES_CSV_URL");
  },
  get unidadesCsvUrl() {
    return optional("UNIDADES_CSV_URL");
  },
} as const;
