import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import { Card, SectionTitle, MiniStat } from "@/components/ui";
import PnLTable from "@/components/PnLTable";
import OpexDetalle from "@/components/OpexDetalle";
import Insights from "@/components/Insights";
import type { Insight } from "@/lib/insights";
import {
  seriePnLCash,
  prestamoDeUnidad,
  equityUnidad,
  lecturaCaja,
  type UnidadFinanciacion,
} from "@/lib/finance";
import { CAP_RATE } from "@/lib/config";
import { eur, pct, pctDirecto, mesLabel } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  seriePnL,
  noiTTM,
  costesPorCategoria,
  estadoDatos,
  ttm,
  mesPorDefecto,
  mesesDePeriodo,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; periodo?: string; unidad?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo: Periodo = (PERIODOS.includes(sp.periodo ?? "") ? sp.periodo : "ttm") as Periodo;

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const unidades = await getUnidades();
  const sel = sp.unidad ? unidades.find((u) => u.listingId === sp.unidad) : undefined;

  const mesesTTM = ttm(mes);
  const periodMeses = mesesDePeriodo(mes, periodo);
  const todos = Array.from(new Set([...mesesTTM, ...periodMeses]));
  const map = await unidadMesMap(unidades, todos);

  const alcance = sel ? [sel] : unidades;
  const serie = seriePnL(map, alcance, mesesTTM);

  const itemsPeriodo: UnidadMes[] = alcance.flatMap((u) =>
    periodMeses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x),
  );
  const rPeriodo = sumar(itemsPeriodo);

  // Hasta caja: deuda simulada (unidades con coste de adquisicion) y overhead
  // repartido por cuota de ingresos netos del portfolio.
  const seriePortfolio = sel ? seriePnL(map, unidades, mesesTTM) : serie;
  const unidadesFin: UnidadFinanciacion[] = alcance.map((u) => ({
    costeAdquisicion: u.costeAdquisicion,
    inicio: u.fechaInicio ?? u.primeraNoche,
    nombre: u.displayName,
    nickname: u.nickname,
  }));
  const serieCash = seriePnLCash(serie, seriePortfolio, unidadesFin, unidades.length);

  const totalTTM = serieCash.reduce(
    (a, m) => ({
      ing: a.ing + m.brutos,
      noi: a.noi + m.noi,
      overhead: a.overhead + m.overhead,
      intereses: a.intereses + m.intereses,
      principal: a.principal + m.principal,
      caja: a.caja + m.caja,
    }),
    { ing: 0, noi: 0, overhead: 0, intereses: 0, principal: 0, caja: 0 },
  );
  const servicioTTM = totalTTM.intereses + totalTTM.principal;
  const dscrTTM = servicioTTM > 0 ? totalTTM.noi / servicioTTM : null;
  const deudaViva = serieCash.length ? serieCash[serieCash.length - 1].saldoDeuda : 0;
  const equity = alcance.reduce(
    (s, u) =>
      s + equityUnidad(u.costeAdquisicion, prestamoDeUnidad(u.displayName, u.nickname)),
    0,
  );
  const cashOnCash = equity > 0 ? (totalTTM.caja / equity) * 100 : null;

  // Lectura rapida del P&L de caja.
  const consejosCaja: Insight[] = lecturaCaja(totalTTM, equity, !!sel);

  // Patrimonio orientativo: valor implicito por cap rate sobre el NOI TTM de
  // las unidades en propiedad del alcance, contra la deuda viva real.
  const propias = alcance.filter(
    (u) =>
      (u.costeAdquisicion && u.costeAdquisicion > 0) ||
      prestamoDeUnidad(u.displayName, u.nickname),
  );
  const noiTTMPropio = propias.reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const costePropio = propias.reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const valorRef = noiTTMPropio > 0 ? noiTTMPropio / CAP_RATE.ref : null;
  const valorMin = noiTTMPropio > 0 ? noiTTMPropio / CAP_RATE.max : null;
  const valorMax = noiTTMPropio > 0 ? noiTTMPropio / CAP_RATE.min : null;
  const equityNeto = valorRef !== null ? valorRef - deudaViva : null;
  const ltvActual = valorRef && valorRef > 0 ? deudaViva / valorRef : null;

  const opexCats = await costesPorCategoria(periodMeses, sel?.nickname);
  const etiqueta = etiquetaPeriodo(mes, periodo);

  const chip = (activo: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1 text-sm transition ${
      activo
        ? "border-brand bg-brand text-white"
        : "border-line bg-surface text-muted hover:border-brand hover:text-brand"
    }`;

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        periodo={periodo}
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        {/* Selector de alcance por chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <a href={`/pnl?mes=${mes}&periodo=${periodo}`} className={chip(!sel)}>
            Portfolio
          </a>
          {unidades.map((u) => (
            <a
              key={u.listingId}
              href={`/pnl?mes=${mes}&periodo=${periodo}&unidad=${u.listingId}`}
              className={chip(sel?.listingId === u.listingId)}
            >
              {u.displayName}
            </a>
          ))}
        </div>

        {/* Resumen ejecutivo del alcance */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label="Ingresos TTM" value={eur(totalTTM.ing)} />
          <MiniStat label="NOI TTM" value={eur(totalTTM.noi)} />
          <MiniStat
            label="Margen NOI TTM"
            value={totalTTM.ing > 0 ? pct(totalTTM.noi / totalTTM.ing) : "-"}
          />
          <MiniStat
            label={`NOI · ${etiqueta}`}
            value={eur(rPeriodo.noi)}
          />
          <MiniStat label="Caja neta TTM" value={eur(totalTTM.caja)} />
          <MiniStat label="DSCR TTM" value={dscrTTM !== null ? `${dscrTTM.toFixed(2)}x` : "sin deuda"} />
          <MiniStat label="Deuda viva" value={eur(deudaViva)} />
          <MiniStat
            label="Cash-on-cash TTM"
            value={cashOnCash !== null ? pctDirecto(cashOnCash) : "-"}
          />
        </div>

        {consejosCaja.length > 0 && (
          <Card>
            <SectionTitle>Lectura del P&amp;L de caja</SectionTitle>
            <Insights insights={consejosCaja} />
          </Card>
        )}

        <Card>
          <SectionTitle>
            P&amp;L mensual hasta caja · {sel ? sel.displayName : "portfolio"} · 12 meses hasta {mesLabel(mes)}
          </SectionTitle>
          <PnLTable serie={serieCash} />
        </Card>

        {valorRef !== null && (
          <Card>
            <SectionTitle>
              Patrimonio (orientativo) · {sel ? sel.displayName : "unidades en propiedad"}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <MiniStat
                label={`Valor implicito (${Math.round(CAP_RATE.ref * 100)}% cap)`}
                value={eur(valorRef)}
              />
              <MiniStat
                label="Banda de valor"
                value={`${eur(valorMin)} - ${eur(valorMax)}`}
              />
              <MiniStat label="Deuda viva" value={eur(deudaViva)} />
              <MiniStat label="Equity neto" value={eur(equityNeto)} />
              <MiniStat
                label="Plusvalia vs coste"
                value={costePropio > 0 ? eur(valorRef - costePropio) : "-"}
              />
              <MiniStat label="LTV actual" value={ltvActual !== null ? pct(ltvActual) : "-"} />
            </div>
            <p className="mt-2 text-xs text-faint">
              Valor = NOI TTM de las unidades en propiedad ({eur(noiTTMPropio)}) capitalizado a un
              cap rate del {Math.round(CAP_RATE.min * 100)}-{Math.round(CAP_RATE.max * 100)}% (
              referencia {Math.round(CAP_RATE.ref * 100)}%). Es una referencia de gestion, no una
              tasacion. El equity neto usa el valor de referencia menos la deuda viva real; cada
              mes se suman ~{eur(totalTTM.principal / 12)} de amortizacion al patrimonio.
            </p>
          </Card>
        )}

        <Card>
          <SectionTitle>
            Desglose de costes · {sel ? sel.displayName : "portfolio"} · {etiqueta}
          </SectionTitle>
          <OpexDetalle categorias={opexCats} ingresos={rPeriodo.brutos} />
        </Card>
      </main>
    </div>
  );
}
