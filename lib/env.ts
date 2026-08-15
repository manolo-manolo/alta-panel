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

  // Analitica web (GA4 + Search Console via service account de Google).
  // Todos opcionales: sin ellos la pestana /web muestra la guia de conexion.
  get googleServiceAccountEmail() {
    return optional("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  },
  get googleServiceAccountKey() {
    // Clave privada PEM. En Vercel se pega con \n literales; se normalizan aqui.
    return optional("GOOGLE_SERVICE_ACCOUNT_KEY")?.replace(/\\n/g, "\n");
  },
  get ga4PropertyId() {
    return optional("GA4_PROPERTY_ID");
  },
  get gscSiteUrl() {
    return optional("GSC_SITE_URL");
  },
} as const;
