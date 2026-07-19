-- ============================================================================
-- Alta Panel - esquema de base de datos (Postgres / Neon)
-- Idempotente: se puede ejecutar varias veces sin error.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Token de Guesty cacheado (una sola fila, id = 1).
-- CRITICO: Guesty limita la emision de tokens (~5/dia, validos 24h).
-- Reutilizamos el token cacheado y solo pedimos uno nuevo cuando queda < 1h.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guesty_token (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT        NOT NULL,
  token_type   TEXT        NOT NULL DEFAULT 'Bearer',
  scope        TEXT,
  obtained_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- Listings (unidades tal cual las devuelve Guesty).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id         TEXT PRIMARY KEY,          -- Guesty _id
  nickname   TEXT,                      -- clave de union con la hoja de costes
  title      TEXT,
  address    TEXT,
  active     BOOLEAN NOT NULL DEFAULT true,
  raw        JSONB,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listings_nickname ON listings (nickname);

-- ---------------------------------------------------------------------------
-- Reservas (confirmadas y completadas) con el objeto money completo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id                TEXT PRIMARY KEY,   -- Guesty _id
  listing_id        TEXT NOT NULL,
  confirmation_code TEXT,
  status            TEXT,               -- confirmed | completed | ...
  source            TEXT,               -- canal crudo de Guesty
  guest_name        TEXT,
  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  nights            INTEGER NOT NULL,
  currency          TEXT DEFAULT 'EUR',
  -- Objeto money desglosado (importes totales de la reserva).
  accommodation_eur NUMERIC(14,2) NOT NULL DEFAULT 0,  -- fareAccommodation
  cleaning_eur      NUMERIC(14,2) NOT NULL DEFAULT 0,  -- fareCleaning
  commission_eur    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- host channel fee / commission
  total_payout_eur  NUMERIC(14,2) NOT NULL DEFAULT 0,  -- hostPayout
  money             JSONB,              -- objeto money crudo
  reservation_created_at TIMESTAMPTZ,   -- para lead time / ventana de reserva
  last_updated_at   TIMESTAMPTZ,        -- Guesty lastUpdatedAt (sync incremental)
  raw               JSONB,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_listing ON reservations (listing_id);
CREATE INDEX IF NOT EXISTS idx_reservations_checkin ON reservations (check_in);
CREATE INDEX IF NOT EXISTS idx_reservations_lastupdated ON reservations (last_updated_at);

-- ---------------------------------------------------------------------------
-- Noches derivadas: una fila por noche vendida.
-- El ingreso por alojamiento y la comision se prorratean por noche.
-- La limpieza se reconoce integra en la noche de check-in (0 en el resto).
-- Se reconstruye por reserva en cada sync.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservation_nights (
  reservation_id    TEXT NOT NULL,
  listing_id        TEXT NOT NULL,
  night             DATE NOT NULL,
  mes               TEXT NOT NULL,      -- YYYY-MM
  channel           TEXT NOT NULL,      -- canal normalizado
  status            TEXT,
  accommodation_eur NUMERIC(14,4) NOT NULL DEFAULT 0,
  commission_eur    NUMERIC(14,4) NOT NULL DEFAULT 0,
  cleaning_eur      NUMERIC(14,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (reservation_id, night)
);
CREATE INDEX IF NOT EXISTS idx_nights_listing_mes ON reservation_nights (listing_id, mes);
CREATE INDEX IF NOT EXISTS idx_nights_mes ON reservation_nights (mes);

-- ---------------------------------------------------------------------------
-- Disponibilidad / calendario por listing y dia.
-- Permite calcular noches disponibles y noches bloqueadas (owner/mantenimiento).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_availability (
  listing_id   TEXT NOT NULL,
  date         DATE NOT NULL,
  mes          TEXT NOT NULL,          -- YYYY-MM
  status       TEXT,                   -- available | booked | unavailable ...
  is_available BOOLEAN NOT NULL DEFAULT true,  -- cuenta como inventario disponible
  is_blocked   BOOLEAN NOT NULL DEFAULT false, -- bloqueo owner/mantenimiento
  raw          JSONB,
  PRIMARY KEY (listing_id, date)
);
CREATE INDEX IF NOT EXISTS idx_availability_listing_mes ON listing_availability (listing_id, mes);

-- ---------------------------------------------------------------------------
-- Costes de la hoja "Costes".
-- Se reemplaza el contenido completo en cada sync (dataset pequeno).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_rows (
  id          BIGSERIAL PRIMARY KEY,
  mes         TEXT NOT NULL,           -- YYYY-MM
  unidad      TEXT NOT NULL,           -- nickname del listing
  categoria   TEXT NOT NULL,
  concepto    TEXT,
  importe_eur NUMERIC(14,2) NOT NULL DEFAULT 0,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_costs_unidad_mes ON cost_rows (unidad, mes);
CREATE INDEX IF NOT EXISTS idx_costs_mes ON cost_rows (mes);

-- ---------------------------------------------------------------------------
-- Metadatos de unidades de la hoja "Unidades".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units_meta (
  unidad                        TEXT PRIMARY KEY,
  tipo                          TEXT NOT NULL,  -- propiedad | master_lease
  coste_total_adquisicion_eur   NUMERIC(14,2),
  renta_mensual_eur             NUMERIC(14,2),
  fecha_inicio                  DATE,
  synced_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Estado del sync (cursor incremental, ultima actualizacion, rate limit).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- Historial de sincronizaciones (para el banner y "filas con errores").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id                   BIGSERIAL PRIMARY KEY,
  kind                 TEXT NOT NULL,   -- cron | manual
  mode                 TEXT,            -- full | incremental
  status               TEXT NOT NULL,   -- ok | error | partial
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ,
  listings_upserted    INTEGER DEFAULT 0,
  reservations_upserted INTEGER DEFAULT 0,
  cost_rows_loaded     INTEGER DEFAULT 0,
  row_errors           JSONB DEFAULT '[]'::jsonb,  -- filas con errores de la hoja
  message              TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log (started_at DESC);
