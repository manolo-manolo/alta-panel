import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader, KpiCard, StatGrid } from "@/components/ui";
import Insights from "@/components/Insights";
import CostChart, { type PuntoCoste } from "@/components/charts/CostChart";
import CostMatrix, { type FilaCoste } from "@/components/CostMatrix";
import CostMovers, { type Movimiento } from "@/components/CostMovers";
import OpexDetalle from "@/components/OpexDetalle";
import { costesUnidadCategoriaMes, type CosteCelda } from "@/lib/costs";
import {
  generarInsightsCostes,
  type CosteUnidadResumen,
} from "@/lib/cost-insights";
import { CATEGORIAS } from "@/lib/config";
import { eur, pct, delta } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  seriePnL,
  estadoDatos,
  costesPorCategoria,
  ttm,
  mesPorDefecto,
  mesPrevio,
  mesesDePeriodo,
  desplazarMeses,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
  type UnidadInfo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function CostesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo: Periodo = (PERIODOS.includes(sp.periodo ?? "") ? sp.periodo : "mes") as Periodo;

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  let unidades: UnidadInfo[];
  try {
    unidades = await getUnidades();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <AppShell titulo="Costes" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Base de datos no disponible" detalle={`Detalle técnico: ${msg}`} />
      </AppShell>
    );
  }
  if (unidades.length === 0) {
    return (
      <AppShell titulo="Costes" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Todavía no hay unidades sincronizadas" />
      </AppShell>
    );
  }

  const periodMeses = mesesDePeriodo(mes, periodo);
  const priorMeses = desplazarMeses(periodMeses, -12);
  const prevMes = mesPrevio(mes);
  const mesesTTM = ttm(mes);
  const todos = Array.from(new Set([...periodMeses, ...priorMeses, ...mesesTTM, prevMes]));

  const [map, celdas, catsAct, catsPrior] = await Promise.all([
    unidadMesMap(unidades, todos),
    costesUnidadCategoriaMes(Array.from(new Set([...periodMeses, ...mesesTTM]))),
    costesPorCategoria(periodMeses),
    costesPorCategoria(priorMeses),
  ]);

  const itemsUnidad = (u: UnidadInfo, meses: string[]): UnidadMes[] =>
    meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);
  const itemsDe = (meses: string[]): UnidadMes[] =>
    unidades.flatMap((u) => itemsUnidad(u, meses));

  const rAct = sumar(itemsDe(periodMeses));
  const rPrev = sumar(itemsDe([prevMes]));
  const rPrior = sumar(itemsDe(priorMeses));
  const esMes = periodo === "mes";

  const opex = (r: typeof rAct) => r.costesVariables + r.costesFijos;
  const ratioDe = (r: typeof rAct) => (r.netos > 0 ? opex(r) / r.netos : null);
  const porNoche = (r: typeof rAct) => (r.vendidas > 0 ? opex(r) / r.vendidas : null);

  // Serie mensual (12 meses) para el grafico.
  const serie = seriePnL(map, unidades, mesesTTM);
  const chartData: PuntoCoste[] = serie.map((s) => ({
    mes: s.mes,
    fijos: s.costesFijos,
    variables: s.costesVariables,
    ratio: s.netos > 0 ? (s.costesFijos + s.costesVariables) / s.netos : null,
  }));

  // Celdas del periodo por unidad (nickname) y categoria.
  const periodSet = new Set(periodMeses);
  const porUnidadCat = new Map<string, Map<string, { importe: number; estimado: number }>>();
  for (const c of celdas) {
    if (!periodSet.has(c.mes)) continue;
    const u = porUnidadCat.get(c.unidad) ?? new Map();
    const cur = u.get(c.categoria) ?? { importe: 0, estimado: 0 };
    cur.importe += c.importe;
    cur.estimado += c.importeEstimado;
    u.set(c.categoria, cur);
    porUnidadCat.set(c.unidad, u);
  }

  const categoriasConDatos = (CATEGORIAS as readonly string[]).filter((cat) =>
    [...porUnidadCat.values()].some((u) => (u.get(cat)?.importe ?? 0) !== 0),
  );

  // Filas de la matriz y resumen por unidad para los consejos.
  const filas: FilaCoste[] = [];
  const resumenUnidades: CosteUnidadResumen[] = [];
  let estimadoTotal = 0;
  for (const u of unidades) {
    const r = sumar(itemsUnidad(u, periodMeses));
    const cats = porUnidadCat.get(u.nickname) ?? new Map<string, { importe: number; estimado: number }>();
    const valores: Record<string, number> = {};
    const estimadas: Record<string, boolean> = {};
    let total = 0;
    for (const [cat, v] of cats) {
      valores[cat] = v.importe;
      estimadas[cat] = v.estimado > 0;
      total += v.importe;
      estimadoTotal += v.estimado;
    }
    if (total === 0 && r.netos === 0) continue; // unidad sin actividad en el periodo
    filas.push({
      listingId: u.listingId,
      nombre: u.displayName,
      valores,
      estimadas,
      total,
      netos: r.netos,
    });
    resumenUnidades.push({
      nombre: u.displayName,
      netos: r.netos,
      opex: total,
      fijos: r.costesFijos,
      variables: r.costesVariables,
      vendidas: r.vendidas,
      suministros: valores["suministros"] ?? 0,
      limpiezaCoste: valores["limpieza_extra"] ?? 0,
      limpiezaIngreso: r.limpieza,
      costesPendientes: itemsUnidad(u, periodMeses).some((x) => x.costesPendientes),
    });
  }
  const totalFila: FilaCoste = {
    listingId: "__total__",
    nombre: "Portfolio",
    valores: {},
    estimadas: {},
    total: 0,
    netos: rAct.netos,
  };
  for (const f of filas) {
    for (const [cat, v] of Object.entries(f.valores)) {
      totalFila.valores[cat] = (totalFila.valores[cat] ?? 0) + v;
      totalFila.estimadas[cat] = totalFila.estimadas[cat] || f.estimadas[cat];
    }
    totalFila.total += f.total;
  }

  // Serie TTM por categoria (portfolio) para detectar picos.
  const categoriaMesTTM = celdas.map((c: CosteCelda) => ({
    categoria: c.categoria,
    mes: c.mes,
    importe: c.importe,
  }));

  // Variaciones por concepto vs mismo periodo del ano anterior.
  const clave = (categoria: string, concepto: string) => `${concepto} (${categoria})`;
  const moverMap = new Map<string, Movimiento>();
  for (const c of catsAct) {
    for (const x of c.conceptos) {
      const k = clave(c.categoria, x.concepto);
      const m = moverMap.get(k) ?? { etiqueta: k, actual: 0, anterior: 0 };
      m.actual += x.importe;
      moverMap.set(k, m);
    }
  }
  for (const c of catsPrior) {
    for (const x of c.conceptos) {
      const k = clave(c.categoria, x.concepto);
      const m = moverMap.get(k) ?? { etiqueta: k, actual: 0, anterior: 0 };
      m.anterior += x.importe;
      moverMap.set(k, m);
    }
  }
  const movers = [...moverMap.values()];

  const insights = generarInsightsCostes({
    esMes,
    mesActual: mes,
    unidades: resumenUnidades,
    totalNetos: rAct.netos,
    totalOpex: opex(rAct),
    totalFijos: rAct.costesFijos,
    opexPrior: opex(rPrior) > 0 ? opex(rPrior) : null,
    netosPrior: rPrior.netos > 0 ? rPrior.netos : null,
    fijosPrior: rPrior.costesFijos > 0 ? rPrior.costesFijos : null,
    categoriaMesTTM,
    movers,
    pctEstimado: totalFila.total > 0 ? estimadoTotal / totalFila.total : 0,
  });

  const etiqueta = etiquetaPeriodo(mes, periodo);

  return (
    <AppShell
      titulo="Costes"
      subtitulo={`Opex de la cartera · ${etiqueta}`}
      contexto={{ mes, periodo }}
      estado={estado}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="Opex total"
          value={eur(opex(rAct))}
          invertido
          deltaMoM={esMes ? delta(opex(rAct), opex(rPrev)) : undefined}
          deltaYoY={delta(opex(rAct), opex(rPrior))}
        />
        <KpiCard label="Costes fijos" value={eur(rAct.costesFijos)} invertido
          sub={opex(rAct) > 0 ? `${pct(rAct.costesFijos / opex(rAct), 0)} del opex` : undefined}
          deltaYoY={delta(rAct.costesFijos, rPrior.costesFijos)} />
        <KpiCard label="Costes variables" value={eur(rAct.costesVariables)} invertido
          deltaYoY={delta(rAct.costesVariables, rPrior.costesVariables)} />
        <KpiCard label="Opex sobre ingresos netos" value={pct(ratioDe(rAct))} invertido
          deltaYoY={delta(ratioDe(rAct), ratioDe(rPrior))} />
        <KpiCard label="Coste por noche vendida" value={eur(porNoche(rAct))} invertido
          sub={rAct.disponibles > 0 ? `${eur(opex(rAct) / rAct.disponibles)} por noche disponible` : undefined}
          deltaYoY={delta(porNoche(rAct), porNoche(rPrior))} />
        <KpiCard label="NOI resultante" value={eur(rAct.noi)}
          deltaYoY={delta(rAct.noi, rPrior.noi)} />
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader titulo="Consejos de costes" descripcion="Dónde se va el margen y qué hacer" />
          <Insights insights={insights} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            titulo="Evolución de costes"
            descripcion="Fijos y variables, y su peso sobre los ingresos netos · últimos 12 meses"
          />
          <CostChart data={chartData} />
        </Card>
        <Card>
          <CardHeader titulo="Por categoría y concepto" descripcion={etiqueta} />
          <OpexDetalle categorias={catsAct} />
        </Card>
      </div>

      <Card>
        <CardHeader titulo="Costes por unidad y categoría" descripcion={etiqueta} />
        <CostMatrix filas={filas} total={totalFila} categorias={categoriasConDatos} mes={mes} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader titulo="Variaciones" descripcion="Frente al mismo periodo del año pasado" />
          <CostMovers movers={movers} />
        </Card>
        <div className="flex flex-col gap-3">
          <StatGrid
            className="sm:grid-cols-2"
            items={[
              { label: "Limpieza cobrada", value: eur(rAct.limpieza) },
              { label: "Limpieza pagada", value: eur(totalFila.valores["limpieza_extra"] ?? 0) },
              { label: "Fijos sobre opex", value: pct(opex(rAct) > 0 ? rAct.costesFijos / opex(rAct) : null) },
              {
                label: "Coste por noche disponible",
                value: eur(rAct.disponibles > 0 ? opex(rAct) / rAct.disponibles : null),
              },
            ]}
          />
        </div>
      </div>
    </AppShell>
  );
}
