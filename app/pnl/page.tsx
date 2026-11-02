import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import { Card, CardHeader, KpiCard, StatGrid, pillClass } from "@/components/ui";
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
  pesosEstacionales,
  costesPorCategoria,
  estadoDatos,
  ttm,
  mesPorDefecto,
  mesesDePeriodo,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
} from "@/lib/metrics";
import { ritmoCajaAlcance } from "@/lib/acciones";

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

  // Unidades con menos de 12 meses: su caja de 12 meses son unos pocos meses,
  // asi que DSCR y cash-on-cash se dan tambien a ritmo anual.
  const pesos = pesosEstacionales(map, unidades, mesesTTM);
  const ritmo = ritmoCajaAlcance({ alcance, unidades, map, mesesTTM, pesos });
  const conRitmo = !!ritmo && ritmo.parciales.length > 0;

  // Lectura rapida del P&L de caja.
  const consejosCaja: Insight[] = lecturaCaja(totalTTM, equity, !!sel, ritmo);

  // Patrimonio orientativo: valor implicito por cap rate sobre el NOI a ritmo
  // anual de las unidades en propiedad del alcance, contra la deuda viva real.
  // Las que llevan menos de 2 meses no tienen ritmo: se valoran a coste.
  const propias = alcance.filter(
    (u) =>
      u.finOperacion === null &&
      ((u.costeAdquisicion && u.costeAdquisicion > 0) ||
        prestamoDeUnidad(u.displayName, u.nickname)),
  );
  const ntPropias = propias.map((u) => ({ u, nt: noiTTM(u, map, mesesTTM, pesos) }));
  const noiRitmoPropio = ntPropias.reduce((s, x) => s + (x.nt.noiAnual ?? 0), 0);
  const anualizadasPropias = ntPropias.filter((x) => x.nt.anualizado && x.nt.noiAnual !== null);
  const aCoste = ntPropias.filter((x) => x.nt.noiAnual === null);
  const costeSinRitmo = aCoste.reduce((s, x) => s + (x.u.costeAdquisicion ?? 0), 0);
  const costePropio = propias.reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const valorCon = (cap: number) =>
    noiRitmoPropio > 0 || costeSinRitmo > 0 ? Math.max(0, noiRitmoPropio) / cap + costeSinRitmo : null;
  const valorRef = valorCon(CAP_RATE.ref);
  const valorMin = valorCon(CAP_RATE.max);
  const valorMax = valorCon(CAP_RATE.min);
  const equityNeto = valorRef !== null ? valorRef - deudaViva : null;
  const ltvActual = valorRef && valorRef > 0 ? deudaViva / valorRef : null;

  const opexCats = await costesPorCategoria(periodMeses, sel?.nickname);
  const etiqueta = etiquetaPeriodo(mes, periodo);

  const alcanceNombre = sel ? sel.displayName : "Portfolio";
  const coma2 = (n: number) => n.toFixed(2).replace(".", ",");

  return (
    <AppShell
      titulo="P&L y caja"
      subtitulo={`${alcanceNombre} · 12 meses cerrados hasta ${mesLabel(mesesTTM[mesesTTM.length - 1])}`}
      contexto={{ mes, periodo }}
      estado={estado}
    >
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <a href={`/pnl?mes=${mes}&periodo=${periodo}`} className={pillClass(!sel)}>
          Portfolio
        </a>
        {unidades.map((u) => (
          <a
            key={u.listingId}
            href={`/pnl?mes=${mes}&periodo=${periodo}&unidad=${u.listingId}`}
            className={pillClass(sel?.listingId === u.listingId)}
          >
            {u.displayName}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Ingresos 12 meses" value={eur(totalTTM.ing)} />
        <KpiCard
          label="NOI 12 meses"
          value={eur(totalTTM.noi)}
          sub={totalTTM.ing > 0 ? `Margen ${pct(totalTTM.noi / totalTTM.ing)}` : undefined}
        />
        <KpiCard
          label="Caja neta 12 meses"
          value={eur(totalTTM.caja)}
          sub={totalTTM.ing > 0 ? `${pct(totalTTM.caja / totalTTM.ing)} de los ingresos` : undefined}
        />
        {periodo === "ttm" ? (
          <KpiCard
            label="Servicio de deuda 12 meses"
            value={servicioTTM > 0 ? eur(servicioTTM) : "Sin deuda"}
            sub={servicioTTM > 0 ? `Incluye ${eur(totalTTM.intereses)} de intereses` : undefined}
          />
        ) : (
          <KpiCard label="NOI del periodo" value={eur(rPeriodo.noi)} sub={etiqueta} />
        )}
        <KpiCard
          label="DSCR 12 meses"
          value={dscrTTM !== null ? `${coma2(dscrTTM)}x` : "Sin deuda"}
          sub={
            conRitmo && ritmo!.dscr !== null
              ? `A ritmo anual ${coma2(ritmo!.dscr)}x (unidades nuevas)`
              : "NOI / servicio de deuda"
          }
        />
        <KpiCard label="Deuda viva" value={eur(deudaViva)} />
        {conRitmo && ritmo!.cashOnCash !== null ? (
          <KpiCard
            label="Cash-on-cash anualizado"
            value={pctDirecto(ritmo!.cashOnCash)}
            sub={`Real 12 meses ${cashOnCash !== null ? pctDirecto(cashOnCash) : "-"} · ${ritmo!.parciales.join(", ")} a ritmo anual`}
          />
        ) : (
          <KpiCard
            label="Cash-on-cash 12 meses"
            value={cashOnCash !== null ? pctDirecto(cashOnCash) : "-"}
            sub="Caja sobre equity invertido"
          />
        )}
        <KpiCard
          label="Amortización 12 meses"
          value={eur(totalTTM.principal)}
          sub="Patrimonio construido"
        />
      </div>

      {consejosCaja.length > 0 && (
        <Card>
          <CardHeader titulo="Lectura del P&L de caja" />
          <Insights insights={consejosCaja} />
        </Card>
      )}

      <Card>
        <CardHeader
          titulo="Cuenta de resultados hasta caja"
          descripcion={`${alcanceNombre} · mes a mes, 12 meses cerrados`}
        />
        <PnLTable serie={serieCash} />
      </Card>

      {valorRef !== null && (
        <Card>
          <CardHeader
            titulo="Patrimonio (orientativo)"
            descripcion={sel ? sel.displayName : "Unidades en propiedad"}
          />
          <StatGrid
            className="lg:grid-cols-6"
            items={[
              { label: `Valor implícito (cap ${Math.round(CAP_RATE.ref * 100)}%)`, value: eur(valorRef) },
              { label: "Banda de valor", value: `${eur(valorMin)} a ${eur(valorMax)}` },
              { label: "Deuda viva", value: eur(deudaViva) },
              { label: "Equity neto", value: eur(equityNeto) },
              { label: "Plusvalía vs coste", value: costePropio > 0 ? eur(valorRef - costePropio) : "-" },
              { label: "LTV actual", value: ltvActual !== null ? pct(ltvActual) : "-" },
            ]}
          />
          <p className="mt-3 text-xs text-faint">
            Valor = NOI a ritmo anual de las unidades en propiedad ({eur(noiRitmoPropio)}
            {anualizadasPropias.length > 0
              ? `; anualizado por estacionalidad para ${anualizadasPropias.map((x) => x.u.displayName).join(", ")}`
              : ""}
            ) capitalizado a un cap rate del {Math.round(CAP_RATE.min * 100)}-
            {Math.round(CAP_RATE.max * 100)}% (referencia {Math.round(CAP_RATE.ref * 100)}%).
            {aCoste.length > 0
              ? ` ${aCoste.map((x) => x.u.displayName).join(", ")} ${aCoste.length > 1 ? "llevan" : "lleva"} menos de 2 meses operando: se ${aCoste.length > 1 ? "valoran" : "valora"} a coste (${eur(costeSinRitmo)}).`
              : ""}{" "}
            Es una referencia de gestión, no una tasación. El equity neto usa el valor de
            referencia menos la deuda viva real; cada mes se suman ~{eur(totalTTM.principal / 12)}{" "}
            de amortización al patrimonio.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader titulo="Desglose de costes" descripcion={`${alcanceNombre} · ${etiqueta}`} />
        <OpexDetalle categorias={opexCats} ingresos={rPeriodo.brutos} />
      </Card>
    </AppShell>
  );
}
