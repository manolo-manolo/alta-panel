import "server-only";
import { query } from "@/lib/db";
import { mesActualMadrid, sumarMeses } from "@/lib/time";

/**
 * Estacionalidad y benchmarks para underwriting de nuevas unidades.
 *
 * Todo se CALCULA sobre meses cerrados (hasta el mes pasado incluido):
 * - ADR sin limpieza = ingreso de alojamiento / noches vendidas.
 * - ADR con limpieza = (alojamiento + limpieza) / noches vendidas.
 * - Ocupacion ajustada al inicio real de cada unidad.
 * - Indice de estacionalidad del mes M = valor del mes M / media global
 *   (ponderado por noches; portfolio completo).
 *
 * Para unidades con pocos datos, los meses sin observacion se ESTIMAN:
 * nivel propio desestacionalizado x indice del portfolio de ese mes.
 * Esos valores van marcados como estimados.
 */

const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const OCC_MAX_EST = 0.97;

export interface MesStat {
  calMes: number; // 1..12
  nObs: number; // meses reales observados (0 = estimado)
  occ: number | null;
  adrSin: number | null;
  adrCon: number | null;
  revparSin: number | null;
  revparCon: number | null;
  estimado: boolean;
}

export interface AnoStat {
  occ: number | null;
  adrSin: number | null;
  adrCon: number | null;
  revparSin: number | null;
  revparCon: number | null;
  algunEstimado: boolean;
}

export interface UnidadEstacionalidad {
  nombre: string;
  mesesConDatos: number;
  primerMes: string | null;
  usaOTB: boolean; // el nivel se calibro con reservas futuras (unidad muy nueva)
  meses: MesStat[];
  ano: AnoStat;
}

export interface IndiceMes {
  calMes: number;
  idxAdr: number | null;
  idxOcc: number | null;
  nObs: number;
}

export interface Estacionalidad {
  cierre: string;
  global: { adrSin: number; adrCon: number; occ: number; noches: number };
  indices: IndiceMes[];
  portfolio: UnidadEstacionalidad;
  unidades: UnidadEstacionalidad[];
}

interface Celda {
  noches: number;
  disp: number;
  alo: number;
  limp: number;
  nObs: number;
}

function celdaVacia(): Celda {
  return { noches: 0, disp: 0, alo: 0, limp: 0, nObs: 0 };
}

function anoDesdeMeses(meses: MesStat[]): AnoStat {
  let noches = 0, dias = 0, ingSin = 0, ingCon = 0;
  let algunEstimado = false;
  for (const m of meses) {
    if (m.occ === null || m.adrSin === null) continue;
    const d = DIAS_MES[m.calMes - 1];
    const n = m.occ * d;
    noches += n;
    dias += d;
    ingSin += (m.adrSin ?? 0) * n;
    ingCon += (m.adrCon ?? m.adrSin ?? 0) * n;
    if (m.estimado) algunEstimado = true;
  }
  if (dias === 0 || noches === 0) {
    return { occ: null, adrSin: null, adrCon: null, revparSin: null, revparCon: null, algunEstimado };
  }
  const occ = noches / dias;
  const adrSin = ingSin / noches;
  const adrCon = ingCon / noches;
  return {
    occ,
    adrSin,
    adrCon,
    revparSin: ingSin / dias,
    revparCon: ingCon / dias,
    algunEstimado,
  };
}

export async function calcularEstacionalidad(): Promise<Estacionalidad> {
  const cierre = sumarMeses(mesActualMadrid(), -1);

  // Noches vendidas y dinero por unidad y mes (cerrados).
  const ventas = await query<{
    unidad: string;
    mes: string;
    noches: string;
    alo: number;
    limp: number;
  }>(
    `SELECT COALESCE(s.display_name, l.nickname) AS unidad, n.mes,
            COUNT(*) AS noches,
            SUM(n.accommodation_eur)::float AS alo,
            SUM(n.cleaning_eur)::float AS limp
     FROM reservation_nights n
     JOIN listings l ON l.id = n.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     WHERE n.mes <= $1
     GROUP BY unidad, n.mes`,
    [cierre],
  );

  // Disponibilidad ajustada al inicio real.
  const dispo = await query<{ unidad: string; mes: string; disp: string }>(
    `WITH starts AS (
       SELECT l.id AS listing_id,
              COALESCE(s.fecha_inicio,
                       (SELECT MIN(night) FROM reservation_nights n WHERE n.listing_id = l.id)) AS inicio
       FROM listings l LEFT JOIN unit_settings s ON s.listing_id = l.id
     )
     SELECT COALESCE(s.display_name, l.nickname) AS unidad, a.mes,
            COUNT(*) FILTER (WHERE a.is_available) AS disp
     FROM listing_availability a
     JOIN listings l ON l.id = a.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     JOIN starts st ON st.listing_id = a.listing_id
     WHERE a.mes <= $1 AND st.inicio IS NOT NULL AND a.date >= st.inicio
     GROUP BY unidad, a.mes`,
    [cierre],
  );
  const dispMap = new Map<string, number>();
  for (const d of dispo) dispMap.set(`${d.unidad}|${d.mes}`, Number(d.disp));

  // OTB (todas las noches, tambien futuras) para calibrar unidades sin meses cerrados.
  const otb = await query<{ unidad: string; noches: string; alo: number; limp: number }>(
    `SELECT COALESCE(s.display_name, l.nickname) AS unidad,
            COUNT(*) AS noches,
            SUM(n.accommodation_eur)::float AS alo,
            SUM(n.cleaning_eur)::float AS limp
     FROM reservation_nights n
     JOIN listings l ON l.id = n.listing_id
     LEFT JOIN unit_settings s ON s.listing_id = l.id
     GROUP BY unidad`,
  );

  // Estructuras por unidad y por mes calendario.
  const porUnidad = new Map<string, { celdas: Celda[]; primerMes: string | null }>();
  const portfolioCeldas: Celda[] = Array.from({ length: 12 }, celdaVacia);

  const asegurar = (u: string) => {
    let e = porUnidad.get(u);
    if (!e) {
      e = { celdas: Array.from({ length: 12 }, celdaVacia), primerMes: null };
      porUnidad.set(u, e);
    }
    return e;
  };

  for (const v of ventas) {
    const cal = Number(v.mes.slice(5, 7)) - 1;
    const disp = dispMap.get(`${v.unidad}|${v.mes}`) ?? 0;
    const e = asegurar(v.unidad);
    const c = e.celdas[cal];
    c.noches += Number(v.noches);
    c.disp += disp;
    c.alo += v.alo;
    c.limp += v.limp;
    c.nObs += 1;
    if (!e.primerMes || v.mes < e.primerMes) e.primerMes = v.mes;

    const p = portfolioCeldas[cal];
    p.noches += Number(v.noches);
    p.disp += disp;
    p.alo += v.alo;
    p.limp += v.limp;
    p.nObs += 1;
  }

  // Global e indices de portfolio.
  let totN = 0, totD = 0, totA = 0, totL = 0;
  for (const p of portfolioCeldas) {
    totN += p.noches; totD += p.disp; totA += p.alo; totL += p.limp;
  }
  const adrGlobal = totN > 0 ? totA / totN : 0;
  const occGlobal = totD > 0 ? totN / totD : 0;
  const upliftGlobal = totA > 0 ? totL / totA : 0;

  const indices: IndiceMes[] = portfolioCeldas.map((p, i) => ({
    calMes: i + 1,
    idxAdr: p.noches > 0 && adrGlobal > 0 ? p.alo / p.noches / adrGlobal : null,
    idxOcc: p.disp > 0 && occGlobal > 0 ? p.noches / p.disp / occGlobal : null,
    nObs: p.nObs,
  }));

  const statDesdeCelda = (c: Celda, calMes: number): MesStat => {
    if (c.noches === 0 || c.disp === 0) {
      return { calMes, nObs: c.nObs, occ: null, adrSin: null, adrCon: null, revparSin: null, revparCon: null, estimado: false };
    }
    const adrSin = c.alo / c.noches;
    const adrCon = (c.alo + c.limp) / c.noches;
    const occ = Math.min(1, c.noches / c.disp);
    return {
      calMes, nObs: c.nObs, occ, adrSin, adrCon,
      revparSin: adrSin * occ, revparCon: adrCon * occ, estimado: false,
    };
  };

  // Portfolio (todos los meses tienen datos).
  const portfolioMeses = portfolioCeldas.map((c, i) => statDesdeCelda(c, i + 1));
  const portfolio: UnidadEstacionalidad = {
    nombre: "Portfolio",
    mesesConDatos: portfolioCeldas.reduce((a, c) => a + c.nObs, 0),
    primerMes: null,
    usaOTB: false,
    meses: portfolioMeses,
    ano: anoDesdeMeses(portfolioMeses),
  };

  const otbMap = new Map(otb.map((o) => [o.unidad, o]));

  // Unidades: reales + estimacion de huecos por nivel x indice.
  const unidades: UnidadEstacionalidad[] = [];
  const nombres = [...new Set([...porUnidad.keys(), ...otbMap.keys()])].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  for (const nombre of nombres) {
    const e = porUnidad.get(nombre) ?? { celdas: Array.from({ length: 12 }, celdaVacia), primerMes: null };
    const celdas = e.celdas;

    // Nivel desestacionalizado de la unidad.
    let nivAdrNum = 0, nivAdrDen = 0, nivOccNum = 0, nivOccDen = 0, uAlo = 0, uLimp = 0;
    for (let i = 0; i < 12; i++) {
      const c = celdas[i];
      const idx = indices[i];
      if (c.noches > 0 && idx.idxAdr) {
        nivAdrNum += c.alo;
        nivAdrDen += c.noches * idx.idxAdr;
        uAlo += c.alo; uLimp += c.limp;
      }
      if (c.disp > 0 && idx.idxOcc) {
        nivOccNum += c.noches;
        nivOccDen += c.disp * idx.idxOcc;
      }
    }

    let usaOTB = false;
    let nivelAdr = nivAdrDen > 0 ? nivAdrNum / nivAdrDen : null;
    let uplift = uAlo > 0 ? uLimp / uAlo : upliftGlobal;
    const nivelOcc = nivOccDen > 0 ? nivOccNum / nivOccDen : occGlobal;

    // Unidad sin ningun mes cerrado: calibrar ADR con sus reservas OTB.
    if (nivelAdr === null) {
      const o = otbMap.get(nombre);
      if (o && Number(o.noches) > 0) {
        // Nivel bruto sin desestacionalizar (aprox.; se marca usaOTB).
        nivelAdr = o.alo / Number(o.noches) / 1.0;
        uplift = o.alo > 0 ? o.limp / o.alo : upliftGlobal;
        usaOTB = true;
      } else {
        nivelAdr = adrGlobal;
        usaOTB = true;
      }
    }

    const meses: MesStat[] = celdas.map((c, i) => {
      const real = statDesdeCelda(c, i + 1);
      if (real.occ !== null) return real;
      const idx = indices[i];
      if (!idx.idxAdr || !idx.idxOcc) return real; // sin indice no se estima
      const adrSin = nivelAdr! * idx.idxAdr;
      const occ = Math.min(OCC_MAX_EST, nivelOcc * idx.idxOcc);
      const adrCon = adrSin * (1 + uplift);
      return {
        calMes: i + 1, nObs: 0, occ, adrSin, adrCon,
        revparSin: adrSin * occ, revparCon: adrCon * occ, estimado: true,
      };
    });

    unidades.push({
      nombre,
      mesesConDatos: celdas.reduce((a, c) => a + c.nObs, 0),
      primerMes: e.primerMes,
      usaOTB,
      meses,
      ano: anoDesdeMeses(meses),
    });
  }

  return {
    cierre,
    global: { adrSin: adrGlobal, adrCon: totN > 0 ? (totA + totL) / totN : 0, occ: occGlobal, noches: totN },
    indices,
    portfolio,
    unidades,
  };
}
