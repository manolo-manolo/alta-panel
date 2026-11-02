import "server-only";
import { query } from "@/lib/db";
import { SQL_OCUPADA_SIN_INGRESO, SQL_VENTANA_UNIDAD, fechaCobertura } from "@/lib/inventario";
import { rangoFechas, type UnidadInfo } from "@/lib/metrics";
import type { Insight } from "@/lib/insights";

// ---------------------------------------------------------------------------
// De donde sale la ocupacion de 12 meses: clasifica cada noche del calendario
// del TTM con las mismas reglas que el inventario (lib/inventario.ts), asi que
// cuadra con la ocupacion del resto del panel. Y explica por que sale la cifra
// que sale, ordenando las causas por noches.
// ---------------------------------------------------------------------------

export interface DiagUnidad {
  listingId: string;
  nombre: string;
  activo: boolean;
  publicado: boolean | null; // isListed de Guesty (null si no consta)
  inicio: string | null;
  fuenteInicio: UnidadInfo["fuenteInicio"];
  primeraNoche: string | null;
  calendario: number; // noches de calendario sincronizadas en el TTM
  antesInicio: number;
  trasBaja: number;
  sinHistorico: number;
  bloqueadas: number;
  ocupadasSinIngreso: number;
  disponibles: number; // a la venta: el denominador de la ocupacion
  vendidas: number;
  vendidasAntesInicio: number; // ventas anteriores a la fecha de inicio declarada
  libresAntesPrimera: number; // a la venta entre la fecha de inicio y la primera reserva
}

export interface DiagMes {
  mes: string;
  disponibles: number;
  vendidas: number;
}

export interface DiagnosticoOcupacion {
  meses: string[];
  unidades: DiagUnidad[];
  porMes: DiagMes[];
  total: Omit<DiagUnidad, "listingId" | "nombre" | "activo" | "publicado" | "inicio" | "fuenteInicio" | "primeraNoche">;
  ocupacion: number | null;
  causas: (Insight & { noches: number })[];
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES_CORTOS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MESES_CORTOS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const pct0 = (f: number) => `${Math.round(f * 100)}%`;
const num = (n: number) => new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(Math.round(n));
const lista = (n: string[]) => (n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`);

export async function diagnosticoOcupacion(
  unidades: UnidadInfo[],
  mesesTTM: string[],
): Promise<DiagnosticoOcupacion> {
  const { desde, hastaExcl } = rangoFechas(mesesTTM);
  const cobertura = fechaCobertura();

  const [dias, noches, listados] = await Promise.all([
    query<{
      listing_id: string;
      mes: string;
      calendario: string;
      antes: string;
      baja: string;
      sin_historico: string;
      osi: string;
      bloqueadas: string;
      disponibles: string;
      libres_antes_primera: string;
    }>(
      `WITH ${SQL_VENTANA_UNIDAD},
       dias AS (
         SELECT a.listing_id, a.mes, a.date, a.is_available, a.is_blocked,
                v.inicio, v.fin, v.primera_noche, v.fuente_inicio,
                ${SQL_OCUPADA_SIN_INGRESO} AS osi
         FROM listing_availability a
         JOIN ventana_unidad v ON v.listing_id = a.listing_id
         WHERE a.date >= $1::date AND a.date < $2::date
       ),
       clas AS (
         SELECT listing_id, mes, date, primera_noche, fuente_inicio,
                CASE
                  WHEN inicio IS NULL OR date < inicio THEN 'antes'
                  WHEN fin IS NOT NULL AND date > fin THEN 'baja'
                  WHEN date < $3::date THEN 'sin_historico'
                  WHEN osi THEN 'osi'
                  WHEN is_blocked THEN 'bloqueada'
                  WHEN is_available THEN 'disponible'
                  ELSE 'bloqueada'
                END AS clase
         FROM dias
       )
       SELECT listing_id, mes,
              COUNT(*) AS calendario,
              COUNT(*) FILTER (WHERE clase = 'antes') AS antes,
              COUNT(*) FILTER (WHERE clase = 'baja') AS baja,
              COUNT(*) FILTER (WHERE clase = 'sin_historico') AS sin_historico,
              COUNT(*) FILTER (WHERE clase = 'osi') AS osi,
              COUNT(*) FILTER (WHERE clase = 'bloqueada') AS bloqueadas,
              COUNT(*) FILTER (WHERE clase = 'disponible') AS disponibles,
              COUNT(*) FILTER (
                WHERE clase = 'disponible' AND fuente_inicio <> 'primera_noche'
                  AND primera_noche IS NOT NULL AND date < primera_noche
              ) AS libres_antes_primera
       FROM clas
       GROUP BY listing_id, mes`,
      [desde, hastaExcl, cobertura],
    ),
    query<{ listing_id: string; mes: string; vendidas: string; antes_inicio: string }>(
      `WITH ${SQL_VENTANA_UNIDAD}
       SELECT n.listing_id, n.mes, COUNT(*) AS vendidas,
              COUNT(*) FILTER (WHERE v.inicio IS NOT NULL AND n.night < v.inicio) AS antes_inicio
       FROM reservation_nights n
       JOIN ventana_unidad v ON v.listing_id = n.listing_id
       WHERE n.night >= $1::date AND n.night < $2::date
       GROUP BY n.listing_id, n.mes`,
      [desde, hastaExcl],
    ),
    query<{ id: string; listed: string | null }>(`SELECT id, raw->>'isListed' AS listed FROM listings`),
  ]);

  const publicado = new Map(listados.map((l) => [l.id, l.listed === null ? null : l.listed === "true"]));
  const vacio = () => ({
    calendario: 0, antesInicio: 0, trasBaja: 0, sinHistorico: 0, bloqueadas: 0,
    ocupadasSinIngreso: 0, disponibles: 0, vendidas: 0, vendidasAntesInicio: 0, libresAntesPrimera: 0,
  });
  type Cuenta = ReturnType<typeof vacio>;
  const porUnidad = new Map<string, Cuenta>();
  const porMes = new Map<string, DiagMes>(mesesTTM.map((m) => [m, { mes: m, disponibles: 0, vendidas: 0 }]));
  const cuenta = (id: string) => {
    let c = porUnidad.get(id);
    if (!c) {
      c = vacio();
      porUnidad.set(id, c);
    }
    return c;
  };
  for (const r of dias) {
    const c = cuenta(r.listing_id);
    c.calendario += Number(r.calendario);
    c.antesInicio += Number(r.antes);
    c.trasBaja += Number(r.baja);
    c.sinHistorico += Number(r.sin_historico);
    c.ocupadasSinIngreso += Number(r.osi);
    c.bloqueadas += Number(r.bloqueadas);
    c.disponibles += Number(r.disponibles);
    c.libresAntesPrimera += Number(r.libres_antes_primera);
    const pm = porMes.get(r.mes);
    if (pm) pm.disponibles += Number(r.disponibles);
  }
  for (const r of noches) {
    const c = cuenta(r.listing_id);
    c.vendidas += Number(r.vendidas);
    c.vendidasAntesInicio += Number(r.antes_inicio);
    const pm = porMes.get(r.mes);
    if (pm) pm.vendidas += Number(r.vendidas);
  }

  const filas: DiagUnidad[] = unidades
    .map((u) => ({
      listingId: u.listingId,
      nombre: u.displayName,
      activo: u.activo,
      publicado: publicado.get(u.listingId) ?? null,
      inicio: u.inicioOperacion,
      fuenteInicio: u.fuenteInicio,
      primeraNoche: u.primeraNoche,
      ...(porUnidad.get(u.listingId) ?? vacio()),
    }))
    .filter((f) => f.calendario > 0 || f.vendidas > 0);

  const total = filas.reduce((a, f) => {
    const out = { ...a };
    for (const k of Object.keys(a) as (keyof Cuenta)[]) out[k] = a[k] + f[k];
    return out;
  }, vacio());
  const ocupacion = total.disponibles > 0 ? total.vendidas / total.disponibles : null;

  return {
    meses: mesesTTM,
    unidades: filas,
    porMes: mesesTTM.map((m) => porMes.get(m)!),
    total,
    ocupacion,
    causas: causasOcupacion(filas, mesesTTM.map((m) => porMes.get(m)!), total, ocupacion),
  };
}

/** Las razones de la cifra, ordenadas por noches en juego. */
function causasOcupacion(
  filas: DiagUnidad[],
  meses: DiagMes[],
  total: DiagnosticoOcupacion["total"],
  occ: number | null,
): (Insight & { noches: number })[] {
  const out: (Insight & { noches: number })[] = [];
  if (occ === null || total.disponibles === 0) return out;
  const sinVender = Math.max(0, total.disponibles - total.vendidas);

  // 1) Estacionalidad: cuanto del hueco esta en los meses flojos.
  const conDatos = meses.filter((m) => m.disponibles > 0);
  if (conDatos.length >= 6 && sinVender > 0) {
    const orden = [...conDatos].sort((a, b) => a.vendidas / a.disponibles - b.vendidas / b.disponibles);
    const flojos = orden.slice(0, 4);
    const resto = orden.slice(4);
    const huecoFlojos = flojos.reduce((s, m) => s + Math.max(0, m.disponibles - m.vendidas), 0);
    const occF = flojos.reduce((s, m) => s + m.vendidas, 0) / Math.max(1, flojos.reduce((s, m) => s + m.disponibles, 0));
    const occR = resto.reduce((s, m) => s + m.vendidas, 0) / Math.max(1, resto.reduce((s, m) => s + m.disponibles, 0));
    if (occR - occF >= 0.08) {
      out.push({
        tono: "info",
        noches: huecoFlojos,
        texto: `Estacionalidad: los 4 meses más flojos (${lista([...flojos].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => mesCorto(m.mes)))}) van al ${pct0(occF)} frente al ${pct0(occR)} del resto y concentran ${num(huecoFlojos)} de las ${num(sinVender)} noches sin vender (${pct0(huecoFlojos / sinVender)}). Ahí está la palanca: estancias medias, descuentos semanales y mensuales, y mínimos más bajos en temporada baja.`,
      });
    }
  }

  // 2) Unidades que mas hunden la media (las dadas de baja ya no se gestionan).
  // Se juzga sin las noches previas a la primera reserva: esas tienen su
  // propia causa (fecha de inicio) y no son un problema de gestion.
  const peores = filas
    .filter((f) => f.activo && f.disponibles - f.libresAntesPrimera >= 60)
    .map((f) => {
      const disp = f.disponibles - f.libresAntesPrimera;
      return { f, disp, occ: f.vendidas / disp, hueco: Math.max(0, disp - f.vendidas) };
    })
    .filter((x) => x.occ < occ - 0.08)
    .sort((a, b) => b.hueco - a.hueco);
  if (peores.length > 0) {
    const huecoP = peores.reduce((s, x) => s + x.hueco, 0);
    // Cuanto subiria el portfolio si esas unidades fueran a la media del resto.
    const resto = filas.filter((f) => !peores.some((p) => p.f.listingId === f.listingId));
    const occResto = resto.reduce((s, f) => s + f.vendidas, 0) / Math.max(1, resto.reduce((s, f) => s + f.disponibles, 0));
    const ganancia = peores.reduce((s, x) => s + Math.max(0, occResto - x.occ) * x.disp, 0);
    out.push({
      tono: "alerta",
      noches: huecoP,
      texto: `${lista(peores.map((x) => `${x.f.nombre} (${pct0(x.occ)})`))} ${peores.length > 1 ? "están" : "está"} más de 8 puntos por debajo de la media. Si fueran al nivel del resto (${pct0(occResto)}), el portfolio ganaría ${num(ganancia)} noches y subiría a ${pct0((total.vendidas + ganancia) / total.disponibles)}.`,
    });
  }

  // 3) Fecha de inicio anterior a la puesta en marcha real.
  for (const f of filas) {
    if (f.libresAntesPrimera >= 14 && f.inicio && f.primeraNoche) {
      const occSin = (total.vendidas) / Math.max(1, total.disponibles - f.libresAntesPrimera);
      out.push({
        tono: "alerta",
        noches: f.libresAntesPrimera,
        texto: `${f.nombre}: ${num(f.libresAntesPrimera)} noches a la venta entre su fecha de inicio (${fechaCorta(f.inicio)}, ${f.fuenteInicio === "ajustes" ? "Ajustes" : "hoja de costes"}) y su primera reserva (${fechaCorta(f.primeraNoche)}). Si en ese tiempo no estaba publicada, corrige la fecha en Ajustes: la ocupación del portfolio pasaría a ${pct0(occSin)}.`,
      });
    }
  }

  // 4) Ventas anteriores a la fecha de inicio: la fecha es demasiado tarde.
  for (const f of filas) {
    if (f.vendidasAntesInicio > 0 && f.inicio) {
      out.push({
        tono: "alerta",
        noches: f.vendidasAntesInicio,
        texto: `${f.nombre} tiene ${num(f.vendidasAntesInicio)} noches vendidas antes de su fecha de inicio (${fechaCorta(f.inicio)}): esas noches cuentan como vendidas pero no como disponibles e inflan su ocupación. Adelanta la fecha en Ajustes.`,
      });
    }
  }

  // 5) Publicacion.
  const noPublicadas = filas.filter((f) => f.activo && f.publicado === false && f.disponibles > 0);
  if (noPublicadas.length > 0) {
    const n = noPublicadas.reduce((s, f) => s + Math.max(0, f.disponibles - f.vendidas), 0);
    out.push({
      tono: "alerta",
      noches: n,
      texto: `${lista(noPublicadas.map((f) => f.nombre))} ${noPublicadas.length > 1 ? "están activas" : "está activa"} en Guesty pero no ${noPublicadas.length > 1 ? "publicadas" : "publicada"}: sus noches libres cuentan como a la venta. Si ya no se comercializa${noPublicadas.length > 1 ? "n" : ""}, desactíva${noPublicadas.length > 1 ? "las" : "la"} en Guesty.`,
    });
  }

  // 6) Correcciones ya aplicadas (informativas).
  if (total.ocupadasSinIngreso > 0) {
    out.push({
      tono: "info",
      noches: total.ocupadasSinIngreso,
      texto: `${num(total.ocupadasSinIngreso)} noches ocupadas en Guesty por reservas que no son venta (pendientes de pago, de propietario o sin confirmar) no cuentan como a la venta. Antes sumaban como noches libres sin vender.`,
    });
  }
  const bajas = filas.filter((f) => f.trasBaja > 0);
  if (bajas.length > 0) {
    out.push({
      tono: "info",
      noches: total.trasBaja,
      texto: `${lista(bajas.map((f) => f.nombre))} ${bajas.length > 1 ? "están dadas" : "está dada"} de baja en Guesty: sus ${num(total.trasBaja)} noches después de la última reserva no cuentan.`,
    });
  }
  const sinFecha = filas.filter((f) => f.activo && f.fuenteInicio === "primera_noche");
  if (sinFecha.length > 0) {
    out.push({
      tono: "info",
      noches: 0,
      texto: `${lista(sinFecha.map((f) => f.nombre))} no ${sinFecha.length > 1 ? "tienen" : "tiene"} fecha de inicio: se usa su primera reserva sincronizada. Ponla en Ajustes para que la ocupación del arranque sea exacta.`,
    });
  }
  const occBloq = total.bloqueadas / Math.max(1, total.disponibles + total.bloqueadas);
  if (occBloq >= 0.05) {
    out.push({
      tono: "info",
      noches: total.bloqueadas,
      texto: `${num(total.bloqueadas)} noches bloqueadas (${pct0(occBloq)} del calendario operativo) no cuentan en la ocupación. Si son estancias de propietario o mantenimiento, bien; si son bloqueos olvidados, son noches que se podrían vender.`,
    });
  }

  const ordenTono = { alerta: 0, info: 1, bueno: 2 } as const;
  return out.sort((a, b) => ordenTono[a.tono] - ordenTono[b.tono] || b.noches - a.noches);
}
