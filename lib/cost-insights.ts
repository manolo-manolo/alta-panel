// Consejos accionables sobre costes. Puro y client-safe: no toca la BD.

import type { Insight } from "@/lib/insights";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

export interface CosteUnidadResumen {
  nombre: string;
  netos: number; // ingresos netos del periodo
  opex: number; // fijos + variables
  fijos: number;
  variables: number;
  vendidas: number; // noches vendidas
  suministros: number;
  limpiezaCoste: number; // categoria limpieza_extra
  limpiezaIngreso: number; // ingreso por limpieza cobrado al huesped
  costesPendientes: boolean; // tiene ingresos pero sin costes cargados
}

export interface CategoriaMesPunto {
  categoria: string;
  mes: string;
  importe: number;
}

export interface ConceptoMovimiento {
  etiqueta: string; // "concepto (categoria)"
  actual: number;
  anterior: number;
}

export interface CostInsightInput {
  esMes: boolean; // el periodo seleccionado es un solo mes
  mesActual: string;
  unidades: CosteUnidadResumen[];
  totalNetos: number;
  totalOpex: number;
  totalFijos: number;
  // Mismo periodo del ano anterior (null si no hay datos)
  opexPrior: number | null;
  netosPrior: number | null;
  fijosPrior: number | null;
  // Serie TTM por categoria (portfolio) para detectar picos
  categoriaMesTTM: CategoriaMesPunto[];
  // Variaciones por concepto vs mismo periodo del ano anterior
  movers: ConceptoMovimiento[];
  pctEstimado: number; // 0-1, parte del opex del periodo que es estimacion
}

const eur0 = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);
const pct0 = (f: number) => `${Math.round(f * 100)}%`;

function label(categoria: string): string {
  return CATEGORIA_LABEL[categoria as Categoria] ?? categoria;
}

export function generarInsightsCostes(i: CostInsightInput): Insight[] {
  const alertas: Insight[] = [];
  const buenas: Insight[] = [];
  const info: Insight[] = [];

  const ratioPortfolio = i.totalNetos > 0 ? i.totalOpex / i.totalNetos : null;

  // 1) Unidades con ratio de costes fuera de banda vs el portfolio.
  if (ratioPortfolio !== null && ratioPortfolio > 0) {
    const fuera = i.unidades
      .filter(
        (u) =>
          u.netos > 500 &&
          u.opex / u.netos > Math.max(ratioPortfolio * 1.3, ratioPortfolio + 0.15),
      )
      .sort((a, b) => b.opex / b.netos - a.opex / a.netos)
      .slice(0, 3);
    for (const u of fuera) {
      const driver =
        u.fijos > u.variables
          ? "los costes fijos (alquiler/comunidad/seguros) pesan mas que los variables: el problema es de estructura o de ingresos bajos"
          : "el gasto variable (limpieza, suministros, mantenimiento) es el que se lleva el margen";
      alertas.push({
        tono: "alerta",
        texto: `${u.nombre} gasta el ${pct0(u.opex / u.netos)} de sus ingresos netos en opex (${eur0(u.opex)} sobre ${eur0(u.netos)}; media del portfolio ${pct0(ratioPortfolio)}): ${driver}.`,
      });
    }
  }

  // 2) Limpieza deficitaria por unidad: cuesta mas de lo que se cobra.
  const limpiezaMal = i.unidades
    .filter((u) => u.limpiezaCoste > 0 && u.limpiezaCoste > u.limpiezaIngreso * 1.05)
    .sort((a, b) => (b.limpiezaCoste - b.limpiezaIngreso) - (a.limpiezaCoste - a.limpiezaIngreso))
    .slice(0, 3);
  if (limpiezaMal.length) {
    const detalle = limpiezaMal
      .map((u) => `${u.nombre} (${eur0(u.limpiezaIngreso - u.limpiezaCoste)})`)
      .join(", ");
    alertas.push({
      tono: "alerta",
      texto: `La limpieza pierde dinero en: ${detalle}. Sube la tarifa de limpieza al huesped o renegocia el coste por servicio.`,
    });
  }

  // 3) Suministros por noche vendida: fugas de consumo.
  const conSum = i.unidades.filter((u) => u.vendidas >= 10 && u.suministros > 0);
  if (conSum.length >= 3) {
    const valores = conSum.map((u) => u.suministros / u.vendidas).sort((a, b) => a - b);
    const mediana = valores[Math.floor(valores.length / 2)];
    const caros = conSum
      .filter((u) => u.suministros / u.vendidas > Math.max(mediana * 1.75, mediana + 3))
      .slice(0, 2);
    for (const u of caros) {
      alertas.push({
        tono: "alerta",
        texto: `${u.nombre} gasta ${eur0(u.suministros / u.vendidas)} de suministros por noche vendida (mediana del portfolio ${eur0(mediana)}). Revisa tarifas de luz, termostatos y consumos en vacio.`,
      });
    }
  }

  // 4) Picos de categoria en el mes vs su media de los 12 meses anteriores.
  if (i.esMes) {
    const porCat = new Map<string, { actual: number; resto: number[] }>();
    for (const p of i.categoriaMesTTM) {
      const c = porCat.get(p.categoria) ?? { actual: 0, resto: [] };
      if (p.mes === i.mesActual) c.actual += p.importe;
      else c.resto.push(p.importe);
      porCat.set(p.categoria, c);
    }
    const picos: string[] = [];
    for (const [cat, v] of porCat) {
      if (v.resto.length < 3) continue;
      const media = v.resto.reduce((a, b) => a + b, 0) / v.resto.length;
      if (v.actual > media * 1.8 && v.actual - media > 75) {
        picos.push(`${label(cat)} (${eur0(v.actual)}, media ${eur0(media)})`);
      }
    }
    if (picos.length) {
      alertas.push({
        tono: "alerta",
        texto: `Picos de gasto este mes muy por encima de su media de 12 meses: ${picos.slice(0, 3).join(", ")}. Abre el desglose por concepto para localizar la factura.`,
      });
    }
  }

  // 5) Costes fijos creciendo vs el ano pasado.
  if (i.fijosPrior !== null && i.fijosPrior > 0) {
    const v = (i.totalFijos - i.fijosPrior) / i.fijosPrior;
    if (v >= 0.1 && i.totalFijos - i.fijosPrior > 200) {
      alertas.push({
        tono: "alerta",
        texto: `Los costes fijos suben un ${pct0(v)} vs el mismo periodo del ano pasado (${eur0(i.totalFijos)} vs ${eur0(i.fijosPrior)}). Son los mas dificiles de revertir: revisa renovaciones de alquiler, seguros y cuotas.`,
      });
    }
  }

  // 6) Evolucion del ratio de costes vs ano pasado.
  if (
    ratioPortfolio !== null &&
    i.opexPrior !== null &&
    i.netosPrior !== null &&
    i.netosPrior > 0
  ) {
    const ratioPrior = i.opexPrior / i.netosPrior;
    if (ratioPortfolio <= ratioPrior - 0.03) {
      buenas.push({
        tono: "bueno",
        texto: `El opex baja del ${pct0(ratioPrior)} al ${pct0(ratioPortfolio)} de los ingresos netos vs el ano pasado: la estructura de costes esta mejorando.`,
      });
    } else if (ratioPortfolio >= ratioPrior + 0.05) {
      alertas.push({
        tono: "alerta",
        texto: `El opex sube del ${pct0(ratioPrior)} al ${pct0(ratioPortfolio)} de los ingresos netos vs el ano pasado: los costes crecen mas rapido que los ingresos.`,
      });
    }
  }

  // 7) Mayores subidas por concepto vs el mismo periodo del ano anterior.
  const subidas = i.movers
    .filter((m) => m.actual - m.anterior > 150 && (m.anterior === 0 || m.actual / m.anterior > 1.3))
    .sort((a, b) => (b.actual - b.anterior) - (a.actual - a.anterior))
    .slice(0, 3);
  if (subidas.length) {
    info.push({
      tono: "info",
      texto: `Mayores subidas vs el ano pasado: ${subidas
        .map((m) => `${m.etiqueta} (+${eur0(m.actual - m.anterior)})`)
        .join(", ")}.`,
    });
  }

  // 8) Datos incompletos o provisionales.
  const pendientes = i.unidades.filter((u) => u.costesPendientes);
  if (pendientes.length) {
    info.push({
      tono: "info",
      texto: `${pendientes.length} unidad(es) con ingresos pero sin costes cargados (su NOI esta sobrestimado): ${pendientes.map((u) => u.nombre).join(", ")}.`,
    });
  }
  if (i.pctEstimado >= 0.3) {
    info.push({
      tono: "info",
      texto: `El ${pct0(i.pctEstimado)} del opex del periodo son estimaciones (run-rate), no facturas reales. Las cifras se consolidaran al cargar el proximo Excel de gastos.`,
    });
  }

  return [...alertas, ...buenas, ...info].slice(0, 7);
}
