import "server-only";
import { query } from "@/lib/db";
import { hoyMadrid, sumarDias, sumarMeses, mesActualMadrid } from "@/lib/time";
import type { UnidadInfo, UnidadMes } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Inteligencia de revenue por unidad para las acciones de maximo beneficio:
//  - Ritmo (pace) por MES futuro: lo ya reservado para cada mes vs lo que
//    habia reservado en el mismo punto del ano pasado para ese mes (STLY) y
//    como cerro. Es la unidad de decision real del pricing (tarifas de
//    noviembre, no "la ventana de 60 dias").
//  - Inventario dia a dia (proximos 60 dias): huecos de 1-2 noches entre
//    reservas, fin de semana vs entre semana, noches sin vender a 15 dias y
//    bloqueos.
// ---------------------------------------------------------------------------

export const MESES_PACE = 4; // meses completos hacia delante a vigilar

export interface MesPace {
  mes: string;
  noches: number; // OTB hoy
  disponibles: number;
  adr: number | null; // ADR OTB
  occ: number | null;
  nochesSTLY: number;
  occSTLY: number | null; // sobre la capacidad del mes LY
  nochesLY: number; // cierre real LY
  occLY: number | null;
  adrLY: number | null;
  diasHasta: number; // dias desde hoy hasta el inicio del mes
}

export interface IntelUnidad {
  mesesPace: MesPace[];
  huecos30: number; // noches en huecos de 1-2 noches entre reservas (30d)
  libres15: number; // noches disponibles sin vender en 15 dias
  finde: { vendidas: number; disponibles: number }; // vie/sab, 60d
  semana: { vendidas: number; disponibles: number }; // dom-jue, 60d
  bloqueadas60: number;
}

/** Meses completos siguientes al actual (p. ej. hoy 20 oct -> nov..feb). */
export function mesesPaceDesdeHoy(): string[] {
  const actual = mesActualMadrid();
  return Array.from({ length: MESES_PACE }, (_, i) => sumarMeses(actual, i + 1));
}

function diasHastaMes(hoy: string, mes: string): number {
  const inicio = new Date(`${mes}-01T00:00:00Z`).getTime();
  const h = new Date(`${hoy}T00:00:00Z`).getTime();
  return Math.round((inicio - h) / 86_400_000);
}

async function stlyPorUnidadMes(
  mesesLY: string[],
  hoyLY: string,
): Promise<Map<string, { noches: number; rev: number }>> {
  const rows = await query<{ listing_id: string; mes: string; noches: string; rev: number }>(
    `SELECT n.listing_id, n.mes, COUNT(*) AS noches,
            COALESCE(SUM(n.accommodation_eur),0) AS rev
     FROM reservation_nights n
     JOIN reservations r ON r.id = n.reservation_id
     WHERE n.mes = ANY($1)
       AND r.reservation_created_at IS NOT NULL
       AND r.reservation_created_at < $2::date
     GROUP BY n.listing_id, n.mes`,
    [mesesLY, hoyLY],
  );
  const m = new Map<string, { noches: number; rev: number }>();
  for (const r of rows) m.set(`${r.listing_id}|${r.mes}`, { noches: Number(r.noches), rev: r.rev });
  return m;
}

interface DiaInv {
  date: string;
  disponible: boolean;
  bloqueado: boolean;
  reservado: boolean;
}

async function inventarioDiario(desde: string, hastaExcl: string): Promise<Map<string, DiaInv[]>> {
  const rows = await query<{
    listing_id: string;
    date: string;
    is_available: boolean;
    is_blocked: boolean;
    reservado: boolean;
  }>(
    `SELECT a.listing_id, a.date, a.is_available, a.is_blocked,
            EXISTS (
              SELECT 1 FROM reservation_nights n
              WHERE n.listing_id = a.listing_id AND n.night = a.date
            ) AS reservado
     FROM listing_availability a
     WHERE a.date >= $1 AND a.date < $2
     ORDER BY a.listing_id, a.date`,
    [desde, hastaExcl],
  );
  const m = new Map<string, DiaInv[]>();
  for (const r of rows) {
    const arr = m.get(r.listing_id) ?? [];
    arr.push({
      date: r.date,
      disponible: r.is_available,
      bloqueado: r.is_blocked,
      reservado: r.reservado,
    });
    m.set(r.listing_id, arr);
  }
  return m;
}

function esFinde(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 5 || d === 6; // viernes y sabado (noches de finde)
}

/** Noches en huecos de 1-2 dias libres encajados entre reservas (o desde hoy). */
function nochesEnHuecos(dias: DiaInv[]): number {
  let total = 0;
  let libres = 0;
  let previoReservado = true; // el borde "hoy" cuenta como limite
  for (const d of dias) {
    if (d.reservado) {
      if (libres > 0 && libres <= 2 && previoReservado) total += libres;
      libres = 0;
      previoReservado = true;
    } else if (d.disponible) {
      libres++;
    } else {
      // bloqueo: rompe la secuencia sin contar hueco
      libres = 0;
      previoReservado = false;
    }
  }
  return total;
}

/**
 * Inteligencia de revenue por unidad. `map` debe contener los meses de pace
 * y sus equivalentes del ano anterior (unidadMesMap).
 */
export async function inteligenciaRevenue(
  unidades: UnidadInfo[],
  map: Map<string, UnidadMes>,
  mesesPace: string[],
): Promise<Map<string, IntelUnidad>> {
  const hoy = hoyMadrid();
  const hoyLY = sumarDias(hoy, -365);
  const mesesLY = mesesPace.map((m) => sumarMeses(m, -12));

  const [stly, inventario] = await Promise.all([
    stlyPorUnidadMes(mesesLY, hoyLY),
    inventarioDiario(hoy, sumarDias(hoy, 60)),
  ]);

  const out = new Map<string, IntelUnidad>();
  for (const u of unidades) {
    const mesesPaceU: MesPace[] = mesesPace.map((mes) => {
      const mesLY = sumarMeses(mes, -12);
      const act = map.get(`${u.listingId}|${mes}`);
      const ly = map.get(`${u.listingId}|${mesLY}`);
      const s = stly.get(`${u.listingId}|${mesLY}`);
      const noches = act?.vendidas ?? 0;
      const disponibles = act?.disponibles ?? 0;
      const dispLY = ly?.disponibles ?? 0;
      return {
        mes,
        noches,
        disponibles,
        adr: act?.adr ?? null,
        occ: disponibles > 0 ? noches / disponibles : null,
        nochesSTLY: s?.noches ?? 0,
        occSTLY: dispLY > 0 ? (s?.noches ?? 0) / dispLY : null,
        nochesLY: ly?.vendidas ?? 0,
        occLY: ly?.ocupacion ?? null,
        adrLY: ly?.adr ?? null,
        diasHasta: diasHastaMes(hoy, mes),
      };
    });

    const dias = inventario.get(u.listingId) ?? [];
    const d30 = dias.slice(0, 30);
    const d15 = dias.slice(0, 15);
    const finde = { vendidas: 0, disponibles: 0 };
    const semana = { vendidas: 0, disponibles: 0 };
    let bloqueadas60 = 0;
    for (const d of dias) {
      if (d.bloqueado) bloqueadas60++;
      if (!d.disponible) continue;
      const b = esFinde(d.date) ? finde : semana;
      b.disponibles++;
      if (d.reservado) b.vendidas++;
    }

    out.set(u.listingId, {
      mesesPace: mesesPaceU,
      huecos30: nochesEnHuecos(d30),
      libres15: d15.filter((d) => d.disponible && !d.reservado).length,
      finde,
      semana,
      bloqueadas60,
    });
  }
  return out;
}
