import { VENTANA_MESES_PASADO } from "@/lib/config";
import { mesActualMadrid, sumarMeses } from "@/lib/time";

// ---------------------------------------------------------------------------
// Inventario efectivo: que noches cuentan como "a la venta" para ocupacion,
// RevPAR y huecos. Es la UNICA definicion; la usan metricas mensuales, vision
// futura, estacionalidad e inteligencia de revenue, para que todas cuadren.
//
// Una noche del calendario de Guesty cuenta si:
//  1. Es posterior al inicio de operacion de la unidad. Prioridad: fecha de
//     inicio en Ajustes > fecha de la hoja de costes > primera noche vendida.
//  2. El listing esta activo en Guesty, o es anterior a su ultima noche
//     vendida (un listing dado de baja no suma noches vacias despues de irse).
//  3. Esta dentro de la ventana con historico completo del sync. El sync
//     semanal completo borra reservas anteriores a la ventana pero no el
//     calendario, asi que esos meses tendrian noches libres sin ventas.
//
// Y se clasifica como:
//  - disponible: libre o con una reserva con ingreso (confirmada/completada).
//  - bloqueada: bloqueo de propietario/mantenimiento, o una noche ocupada en el
//    calendario por una reserva que no es venta (pendiente, propietario...).
//    Esas noches no se podian vender: contarlas como libres hunde la ocupacion
//    y genera "huecos" falsos en las acciones.
// ---------------------------------------------------------------------------

/** Primer mes con historico completo (inicio de la ventana movil del sync). */
export function mesCobertura(): string {
  return sumarMeses(mesActualMadrid(), -VENTANA_MESES_PASADO);
}

/** Primer dia con historico completo, 'YYYY-MM-DD'. */
export function fechaCobertura(): string {
  return `${mesCobertura()}-01`;
}

/**
 * CTE `ventana_unidad`: inicio y fin de operacion por listing.
 * `fin` es NULL para listings activos; para inactivos, su ultima noche vendida
 * (o una fecha antigua si nunca vendieron, para excluirlos del todo).
 */
export const SQL_VENTANA_UNIDAD = `
  ventana_unidad AS (
    SELECT l.id AS listing_id,
           COALESCE(s.fecha_inicio, um.fecha_inicio, pn.primera) AS inicio,
           CASE WHEN l.active THEN NULL::date
                ELSE COALESCE(pn.ultima, DATE '1900-01-01') END AS fin,
           CASE WHEN s.fecha_inicio IS NOT NULL THEN 'ajustes'
                WHEN um.fecha_inicio IS NOT NULL THEN 'hoja'
                WHEN pn.primera IS NOT NULL THEN 'primera_noche'
                ELSE NULL END AS fuente_inicio,
           pn.primera AS primera_noche,
           pn.ultima AS ultima_noche
    FROM listings l
    LEFT JOIN unit_settings s ON s.listing_id = l.id
    LEFT JOIN units_meta um ON um.unidad = l.nickname
    LEFT JOIN (
      SELECT listing_id, MIN(night) AS primera, MAX(night) AS ultima
      FROM reservation_nights
      GROUP BY listing_id
    ) pn ON pn.listing_id = l.id
  )`;

/** Expresion SQL: noche del calendario ocupada por una reserva que no es venta. */
export const SQL_OCUPADA_SIN_INGRESO = `(
    a.is_available
    AND (a.raw->>'reservationId' IS NOT NULL
         OR lower(coalesce(a.status, '')) IN ('booked', 'reserved'))
    AND NOT EXISTS (
      SELECT 1 FROM reservation_nights rn
      WHERE rn.listing_id = a.listing_id AND rn.night = a.date
    )
  )`;

/**
 * CTEs `ventana_unidad` + `inventario` (una fila por listing y noche que
 * cuenta). Uso: `WITH ${sqlInventario("$2")} SELECT ... FROM inventario ...`,
 * pasando fechaCobertura() en ese parametro.
 */
export function sqlInventario(paramCobertura: string): string {
  return `${SQL_VENTANA_UNIDAD},
  inventario AS (
    SELECT a.listing_id, a.date, a.mes,
           (a.is_available AND NOT o.sin_ingreso) AS disponible,
           (a.is_blocked OR o.sin_ingreso) AS bloqueada,
           o.sin_ingreso AS ocupada_sin_ingreso
    FROM listing_availability a
    JOIN ventana_unidad v ON v.listing_id = a.listing_id
    CROSS JOIN LATERAL (SELECT ${SQL_OCUPADA_SIN_INGRESO} AS sin_ingreso) o
    WHERE v.inicio IS NOT NULL
      AND a.date >= v.inicio
      AND (v.fin IS NULL OR a.date <= v.fin)
      AND a.date >= ${paramCobertura}::date
  )`;
}
