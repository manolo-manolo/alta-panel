import "server-only";
import { query } from "@/lib/db";
import { hoyMadrid, sumarDias } from "@/lib/time";

// ---------------------------------------------------------------------------
// KPIs a futuro (on the books): ocupacion, ADR, RevPAR y revenue de las
// proximas ventanas de 15/30/60/90 dias, por unidad y agregado de portfolio.
//
// Tres fotos por ventana:
//  - OTB actual: noches y revenue ya reservados para la ventana.
//  - STLY (same time last year): lo que habia reservado en el mismo punto del
//    ano pasado para la ventana equivalente (reservas creadas antes de
//    hoy - 365 dias). Es la comparacion correcta de ritmo (pace).
//  - Cierre LY: como termino realmente esa ventana el ano pasado. La
//    diferencia entre cierre y STLY es la recogida (pickup) de ultima hora,
//    que usamos para proyectar el cierre de este ano.
//
// Limitaciones conocidas (asumidas a proposito):
//  - Solo hay reservas confirmadas/completadas en la BD, asi que el STLY no
//    incluye reservas que luego se cancelaron.
//  - Reservas sin reservation_created_at no cuentan en el STLY.
// ---------------------------------------------------------------------------

export const VENTANAS_FORWARD = [15, 30, 60, 90] as const;

export interface VentanaForward {
  dias: number;
  desde: string; // YYYY-MM-DD (hoy)
  hastaExcl: string; // YYYY-MM-DD
  // OTB actual
  noches: number;
  revenue: number; // alojamiento OTB
  disponibles: number; // inventario (incluye noches ya vendidas)
  bloqueadas: number;
  occ: number | null;
  adr: number | null;
  revpar: number | null;
  // STLY: on the books en el mismo punto del ano pasado
  nochesSTLY: number;
  revenueSTLY: number;
  occSTLY: number | null;
  adrSTLY: number | null;
  // Cierre real del ano pasado para la ventana equivalente
  nochesLY: number;
  revenueLY: number;
  disponiblesLY: number;
  occLY: number | null;
  adrLY: number | null;
  // Proyeccion de cierre: OTB + recogida del ano pasado (capada a inventario)
  nochesProy: number;
  revenueProy: number;
  occProy: number | null;
}

export interface ForwardData {
  hoy: string;
  portfolio: VentanaForward[];
  porUnidad: Map<string, VentanaForward[]>; // listingId -> ventanas
}

interface BucketNights {
  n: number[]; // noches por ventana
  rev: number[]; // revenue alojamiento por ventana
}
interface BucketAvail {
  disp: number[];
  bloq: number[];
}

const W = VENTANAS_FORWARD.length;
const vacioN = (): BucketNights => ({ n: [0, 0, 0, 0], rev: [0, 0, 0, 0] });
const vacioA = (): BucketAvail => ({ disp: [0, 0, 0, 0], bloq: [0, 0, 0, 0] });

/** Noches OTB por listing y ventana, opcionalmente solo reservas creadas antes de un corte. */
async function nochesVentanas(
  desde: string,
  cortes: string[],
  createdBefore?: string,
): Promise<Map<string, BucketNights>> {
  const filtros = cortes
    .map(
      (_, i) =>
        `COUNT(*) FILTER (WHERE n.night < $${i + 2}) AS n${i},
         COALESCE(SUM(n.accommodation_eur) FILTER (WHERE n.night < $${i + 2}),0) AS rev${i}`,
    )
    .join(",\n");
  const joinRes = createdBefore
    ? "JOIN reservations r ON r.id = n.reservation_id"
    : "";
  const condCreated = createdBefore
    ? `AND r.reservation_created_at IS NOT NULL AND r.reservation_created_at < $${cortes.length + 2}`
    : "";
  const params: unknown[] = [desde, ...cortes];
  if (createdBefore) params.push(createdBefore);
  const rows = await query<Record<string, string | number>>(
    `SELECT n.listing_id, ${filtros}
     FROM reservation_nights n ${joinRes}
     WHERE n.night >= $1 AND n.night < $${cortes.length + 1} ${condCreated}
     GROUP BY n.listing_id`,
    params,
  );
  const m = new Map<string, BucketNights>();
  for (const r of rows) {
    const b = vacioN();
    for (let i = 0; i < W; i++) {
      b.n[i] = Number(r[`n${i}`] ?? 0);
      b.rev[i] = Number(r[`rev${i}`] ?? 0);
    }
    m.set(String(r.listing_id), b);
  }
  return m;
}

/** Inventario (disponibles/bloqueadas) por listing y ventana, desde el inicio real de cada unidad. */
async function availVentanas(
  desde: string,
  cortes: string[],
): Promise<Map<string, BucketAvail>> {
  const filtros = cortes
    .map(
      (_, i) =>
        `COUNT(*) FILTER (WHERE a.is_available AND a.date < $${i + 2}) AS d${i},
         COUNT(*) FILTER (WHERE a.is_blocked AND a.date < $${i + 2}) AS b${i}`,
    )
    .join(",\n");
  const rows = await query<Record<string, string | number>>(
    `WITH starts AS (
       SELECT l.id AS listing_id,
              COALESCE(s.fecha_inicio,
                       (SELECT MIN(night) FROM reservation_nights n WHERE n.listing_id = l.id)
              ) AS inicio
       FROM listings l LEFT JOIN unit_settings s ON s.listing_id = l.id
     )
     SELECT a.listing_id, ${filtros}
     FROM listing_availability a
     JOIN starts st ON st.listing_id = a.listing_id
     WHERE a.date >= $1 AND a.date < $${cortes.length + 1}
       AND st.inicio IS NOT NULL
       AND a.date >= st.inicio
     GROUP BY a.listing_id`,
    [desde, ...cortes],
  );
  const m = new Map<string, BucketAvail>();
  for (const r of rows) {
    const b = vacioA();
    for (let i = 0; i < W; i++) {
      b.disp[i] = Number(r[`d${i}`] ?? 0);
      b.bloq[i] = Number(r[`b${i}`] ?? 0);
    }
    m.set(String(r.listing_id), b);
  }
  return m;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function construirVentana(
  i: number,
  hoy: string,
  otb: BucketNights,
  avail: BucketAvail,
  stly: BucketNights,
  lyFinal: BucketNights,
  availLY: BucketAvail,
): VentanaForward {
  const dias = VENTANAS_FORWARD[i];
  const noches = otb.n[i];
  const revenue = otb.rev[i];
  const disponibles = avail.disp[i];
  const nochesSTLY = stly.n[i];
  const revenueSTLY = stly.rev[i];
  const nochesLY = lyFinal.n[i];
  const revenueLY = lyFinal.rev[i];
  const disponiblesLY = availLY.disp[i];

  // Recogida del ano pasado desde este mismo punto hasta el cierre.
  const pickupNoches = Math.max(0, nochesLY - nochesSTLY);
  const pickupRevenue = Math.max(0, revenueLY - revenueSTLY);
  const nochesProy = Math.min(
    disponibles > 0 ? disponibles : noches + pickupNoches,
    noches + pickupNoches,
  );
  // Si el inventario capa la proyeccion, se escala el revenue de la recogida.
  const fraccionPickup =
    pickupNoches > 0 ? (nochesProy - noches) / pickupNoches : 0;
  const revenueProy = revenue + pickupRevenue * Math.max(0, fraccionPickup);

  return {
    dias,
    desde: hoy,
    hastaExcl: sumarDias(hoy, dias),
    noches,
    revenue,
    disponibles,
    bloqueadas: avail.bloq[i],
    occ: ratio(noches, disponibles),
    adr: ratio(revenue, noches),
    revpar: ratio(revenue, disponibles),
    nochesSTLY,
    revenueSTLY,
    occSTLY: ratio(nochesSTLY, disponiblesLY),
    adrSTLY: ratio(revenueSTLY, nochesSTLY),
    nochesLY,
    revenueLY,
    disponiblesLY,
    occLY: ratio(nochesLY, disponiblesLY),
    adrLY: ratio(revenueLY, nochesLY),
    nochesProy,
    revenueProy,
    occProy: ratio(nochesProy, disponibles),
  };
}

/** Suma un conjunto de buckets (para el agregado de portfolio). */
function sumarBucketsN(items: BucketNights[]): BucketNights {
  const out = vacioN();
  for (const it of items) {
    for (let i = 0; i < W; i++) {
      out.n[i] += it.n[i];
      out.rev[i] += it.rev[i];
    }
  }
  return out;
}
function sumarBucketsA(items: BucketAvail[]): BucketAvail {
  const out = vacioA();
  for (const it of items) {
    for (let i = 0; i < W; i++) {
      out.disp[i] += it.disp[i];
      out.bloq[i] += it.bloq[i];
    }
  }
  return out;
}

/**
 * Calcula las ventanas forward para todas las unidades y el portfolio.
 * `listingIds` define el universo (y el orden no importa); las unidades sin
 * datos devuelven ventanas a cero.
 */
export async function forwardKpis(listingIds: string[]): Promise<ForwardData> {
  const hoy = hoyMadrid();
  const cortes = VENTANAS_FORWARD.map((d) => sumarDias(hoy, d));
  const hoyLY = sumarDias(hoy, -365);
  const cortesLY = VENTANAS_FORWARD.map((d) => sumarDias(hoyLY, d));

  const [otb, avail, stly, lyFinal, availLY] = await Promise.all([
    nochesVentanas(hoy, cortes),
    availVentanas(hoy, cortes),
    nochesVentanas(hoyLY, cortesLY, hoyLY),
    nochesVentanas(hoyLY, cortesLY),
    availVentanas(hoyLY, cortesLY),
  ]);

  const porUnidad = new Map<string, VentanaForward[]>();
  for (const id of listingIds) {
    const ventanas: VentanaForward[] = [];
    for (let i = 0; i < W; i++) {
      ventanas.push(
        construirVentana(
          i,
          hoy,
          otb.get(id) ?? vacioN(),
          avail.get(id) ?? vacioA(),
          stly.get(id) ?? vacioN(),
          lyFinal.get(id) ?? vacioN(),
          availLY.get(id) ?? vacioA(),
        ),
      );
    }
    porUnidad.set(id, ventanas);
  }

  const otbTot = sumarBucketsN(listingIds.map((id) => otb.get(id) ?? vacioN()));
  const availTot = sumarBucketsA(listingIds.map((id) => avail.get(id) ?? vacioA()));
  const stlyTot = sumarBucketsN(listingIds.map((id) => stly.get(id) ?? vacioN()));
  const lyTot = sumarBucketsN(listingIds.map((id) => lyFinal.get(id) ?? vacioN()));
  const availLYTot = sumarBucketsA(listingIds.map((id) => availLY.get(id) ?? vacioA()));
  const portfolio: VentanaForward[] = [];
  for (let i = 0; i < W; i++) {
    portfolio.push(
      construirVentana(i, hoy, otbTot, availTot, stlyTot, lyTot, availLYTot),
    );
  }

  return { hoy, portfolio, porUnidad };
}
