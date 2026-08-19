import "server-only";
import { query } from "@/lib/db";
import { mesActualMadrid, sumarMeses } from "@/lib/time";

/**
 * Estacionalidad y benchmarks para underwriting de nuevas unidades.
 *
 * Base de calculo:
 * - Meses CERRADOS (hasta el mes pasado): ADR sin limpieza = alojamiento /
 *   noches vendidas; ADR con limpieza anade la limpieza; ocupacion ajustada al
 *   inicio real de cada unidad.
 * - Indice de estacionalidad del mes M = valor de M en el portfolio / media
 *   global (ponderado por noches).
 *
 * Para unidades con pocos datos la vista es REALISTA, no conservadora:
 * - El nivel de ADR se calibra con TODAS las reservas reales, incluidas las
 *   futuras en cartera (OTB): son precios contratados, no supuestos.
 * - El nivel de ocupacion propio se pondera con el del portfolio segun cuantos
 *   meses cerrados tenga la unidad (credibilidad n/(n+3)); un solo mes de
 *   apertura no condena la proyeccion anual.
 * - Si un mes calendario proximo ya tiene reservas en cartera relevantes, se
 *   usan su ADR contratado y su ocupacion ya reservada como suelo.
 */

const DIAS_MES = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const OCC_MAX_EST = 0.97;
const CREDIBILIDAD_K = 3; // meses cerrados necesarios para pesar 50/50 con el portfolio
const OTB_MIN_NOCHES = 10; // minimo de noches en cartera para usar un mes OTB

export interface MesStat {
  calMes: number; // 1..12
  nObs: number; // meses cerrados observados (0 = proyectado)
  occ: number | null;
  adrSin: number | null;
  adrCon: number | null;
  revparSin: number | null;
  revparCon: number | null;
  estimado: boolean;
  fuente: "real" | "otb" | "estimado";
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
  rampMes: string | null; // primer mes de operacion excluido como rampa
  usaOTB: boolean;
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
  return {
    occ: noches / dias,
    adrSin: ingSin / noches,
    adrCon: ingCon / noches,
    revparSin: ingSin / dias,
    revparCon: ingCon / dias,
    algunEstimado,
  };
}

export async function calcularEstacionalidad(): Promise<Estacionalidad> {
  const cierre = sumarMeses(mesActualMadrid(), -1);

  // Noches vendidas y dinero por unidad y mes (TODOS los meses, tambien OTB).
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
     GROUP BY unidad, n.mes`,
  );

  // Disponibilidad ajustada al inicio real (todos los meses sincronizados).
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
     WHERE st.inicio IS NOT NULL AND a.date >= st.inicio
     GROUP BY unidad, a.mes`,
  );
  const dispMap = new Map<string, number>();
  for (const d of dispo) dispMap.set(`${d.unidad}|${d.mes}`, Number(d.disp));

  // Separar cerrado vs OTB por unidad.
  const porUnidad = new Map<
    string,
    {
      celdas: Celda[]; // cerrado, por mes calendario
      otb: Map<number, { noches: number; alo: number; limp: number; disp: number }>; // calMes -> datos futuros
      primerMes: string | null;
      mesesCerrados: number;
    }
  >();
  const portfolioCeldas: Celda[] = Array.from({ length: 12 }, celdaVacia);

  const asegurar = (u: string) => {
    let e = porUnidad.get(u);
    if (!e) {
      e = { celdas: Array.from({ length: 12 }, celdaVacia), otb: new Map(), primerMes: null, mesesCerrados: 0 };
      porUnidad.set(u, e);
    }
    return e;
  };

  // Rampa de apertura: el PRIMER mes de operacion de una unidad (dias
  // bloqueados por puesta a punto, sin reviews, ranking frio) no es
  // representativo y se excluye del calibrado y de los indices. Solo aplica a
  // aperturas reales dentro de la ventana de datos, no al corte de la ventana.
  const cerradas = ventas.filter((v) => v.mes <= cierre);
  const ventanaMin = cerradas.reduce(
    (min, v) => (min === null || v.mes < min ? v.mes : min),
    null as string | null,
  );
  const primerMesUnidad = new Map<string, string>();
  for (const v of cerradas) {
    const cur = primerMesUnidad.get(v.unidad);
    if (!cur || v.mes < cur) primerMesUnidad.set(v.unidad, v.mes);
  }
  const rampMes = new Map<string, string>();
  for (const [u, primero] of primerMesUnidad) {
    if (ventanaMin !== null && primero > ventanaMin) rampMes.set(u, primero);
  }

  for (const v of ventas) {
    const cal = Number(v.mes.slice(5, 7)) - 1;
    const disp = dispMap.get(`${v.unidad}|${v.mes}`) ?? 0;
    const e = asegurar(v.unidad);

    if (v.mes <= cierre) {
      if (!e.primerMes || v.mes < e.primerMes) e.primerMes = v.mes;
      if (rampMes.get(v.unidad) === v.mes) continue; // mes de rampa excluido
      const c = e.celdas[cal];
      c.noches += Number(v.noches);
      c.disp += disp;
      c.alo += v.alo;
      c.limp += v.limp;
      c.nObs += 1;
      e.mesesCerrados += 1;

      const p = portfolioCeldas[cal];
      p.noches += Number(v.noches);
      p.disp += disp;
      p.alo += v.alo;
      p.limp += v.limp;
      p.nObs += 1;
    } else {
      // Reservas en cartera para un mes futuro (o el actual, aun sin cerrar).
      const o = e.otb.get(cal + 1) ?? { noches: 0, alo: 0, limp: 0, disp: 0 };
      o.noches += Number(v.noches);
      o.alo += v.alo;
      o.limp += v.limp;
      o.disp = Math.max(o.disp, disp);
      e.otb.set(cal + 1, o);
    }
  }

  // Global e indices de portfolio (solo meses cerrados).
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
      return {
        calMes, nObs: c.nObs, occ: null, adrSin: null, adrCon: null,
        revparSin: null, revparCon: null, estimado: false, fuente: "estimado",
      };
    }
    const adrSin = c.alo / c.noches;
    const adrCon = (c.alo + c.limp) / c.noches;
    const occ = Math.min(1, c.noches / c.disp);
    return {
      calMes, nObs: c.nObs, occ, adrSin, adrCon,
      revparSin: adrSin * occ, revparCon: adrCon * occ, estimado: false, fuente: "real",
    };
  };

  const portfolioMeses = portfolioCeldas.map((c, i) => statDesdeCelda(c, i + 1));
  const portfolio: UnidadEstacionalidad = {
    nombre: "Portfolio",
    mesesConDatos: portfolioCeldas.reduce((a, c) => a + c.nObs, 0),
    primerMes: null,
    rampMes: null,
    usaOTB: false,
    meses: portfolioMeses,
    ano: anoDesdeMeses(portfolioMeses),
  };

  const unidades: UnidadEstacionalidad[] = [];
  const nombres = [...porUnidad.keys()].sort((a, b) => a.localeCompare(b, "es"));

  for (const nombre of nombres) {
    const e = porUnidad.get(nombre)!;
    const celdas = e.celdas;

    // --- Nivel de ADR: TODAS las reservas (cerradas + OTB), desestacionalizado ---
    let nivAdrNum = 0, nivAdrDen = 0, uAlo = 0, uLimp = 0;
    let usaOTB = false;
    for (let i = 0; i < 12; i++) {
      const c = celdas[i];
      const idx = indices[i];
      if (c.noches > 0 && idx.idxAdr) {
        nivAdrNum += c.alo;
        nivAdrDen += c.noches * idx.idxAdr;
        uAlo += c.alo; uLimp += c.limp;
      }
      const o = e.otb.get(i + 1);
      if (o && o.noches > 0 && idx.idxAdr) {
        nivAdrNum += o.alo;
        nivAdrDen += o.noches * idx.idxAdr;
        uAlo += o.alo; uLimp += o.limp;
        usaOTB = true;
      }
    }
    const nivelAdr = nivAdrDen > 0 ? nivAdrNum / nivAdrDen : adrGlobal;
    const uplift = uAlo > 0 ? uLimp / uAlo : upliftGlobal;

    // --- Nivel de ocupacion: propio (cerrado) ponderado con el portfolio ---
    let nivOccNum = 0, nivOccDen = 0;
    for (let i = 0; i < 12; i++) {
      const c = celdas[i];
      const idx = indices[i];
      if (c.disp > 0 && idx.idxOcc) {
        nivOccNum += c.noches;
        nivOccDen += c.disp * idx.idxOcc;
      }
    }
    const nivelOccPropio = nivOccDen > 0 ? nivOccNum / nivOccDen : occGlobal;
    const credibilidad = e.mesesCerrados / (e.mesesCerrados + CREDIBILIDAD_K);
    const nivelOcc = credibilidad * nivelOccPropio + (1 - credibilidad) * occGlobal;

    // --- Celdas mes a mes ---
    const meses: MesStat[] = celdas.map((c, i) => {
      const real = statDesdeCelda(c, i + 1);
      if (real.occ !== null) return real;

      const idx = indices[i];
      if (!idx.idxAdr || !idx.idxOcc) return real;

      const estAdr = nivelAdr * idx.idxAdr;
      const estOcc = Math.min(OCC_MAX_EST, nivelOcc * idx.idxOcc);

      // Mes proximo con reservas en cartera relevantes: precio contratado y
      // ocupacion ya reservada como suelo.
      const o = e.otb.get(i + 1);
      if (o && o.noches >= OTB_MIN_NOCHES) {
        const adrSin = o.alo / o.noches;
        const occOtb = o.disp > 0 ? Math.min(1, o.noches / o.disp) : 0;
        const occ = Math.min(OCC_MAX_EST, Math.max(estOcc, occOtb));
        const adrCon = adrSin * (1 + (o.alo > 0 ? o.limp / o.alo : uplift));
        return {
          calMes: i + 1, nObs: 0, occ, adrSin, adrCon,
          revparSin: adrSin * occ, revparCon: adrCon * occ,
          estimado: true, fuente: "otb",
        };
      }

      const adrCon = estAdr * (1 + uplift);
      return {
        calMes: i + 1, nObs: 0, occ: estOcc, adrSin: estAdr, adrCon,
        revparSin: estAdr * estOcc, revparCon: adrCon * estOcc,
        estimado: true, fuente: "estimado",
      };
    });

    unidades.push({
      nombre,
      mesesConDatos: e.mesesCerrados,
      primerMes: e.primerMes,
      rampMes: rampMes.get(nombre) ?? null,
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
