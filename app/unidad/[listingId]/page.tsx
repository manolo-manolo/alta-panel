import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader, KpiCard, Chip, LinkFlecha } from "@/components/ui";
import NoiRevenueChart from "@/components/charts/NoiRevenueChart";
import ChannelTable from "@/components/ChannelTable";
import ForwardOutlook from "@/components/ForwardOutlook";
import ForwardMeses, { type MesForward } from "@/components/ForwardMeses";
import Insights from "@/components/Insights";
import { forwardKpis } from "@/lib/forward";
import { generarInsightsForward } from "@/lib/forward-insights";
import { sumarMeses } from "@/lib/time";
import PnLTable from "@/components/PnLTable";
import ReservationsList from "@/components/ReservationsList";
import CostBreakdown from "@/components/CostBreakdown";
import ReviewsCard from "@/components/ReviewsCard";
import OpexDetalle from "@/components/OpexDetalle";
import { semaforoRentabilidad } from "@/lib/status";
import { eur, num, pct, mesLabel, pctDirecto, delta } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  seriePnL,
  mixCanales,
  estadoDatos,
  noiTTM,
  statsReservas,
  reservasDelMes,
  costesDetalle,
  costesLimpieza,
  costesPorCategoria,
  resumenReviews,
  reviewsNo5,
  ttm,
  mesPorDefecto,
  mesPrevio,
  mesesDePeriodo,
  desplazarMeses,
  rangoFechas,
  etiquetaPeriodo,
  type Periodo,
  type UnidadMes,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function UnidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ mes?: string; periodo?: string }>;
}) {
  await requireSesion();
  const { listingId } = await params;
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();
  const periodo: Periodo = (PERIODOS.includes(sp.periodo ?? "") ? sp.periodo : "mes") as Periodo;

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const unidades = await getUnidades();
  const u = unidades.find((x) => x.listingId === listingId);
  const opts = unidades.map((x) => ({ listingId: x.listingId, nombre: x.displayName }));

  if (!u) {
    return (
      <AppShell titulo="Unidad no encontrada" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Unidad no encontrada" />
      </AppShell>
    );
  }

  const periodMeses = mesesDePeriodo(mes, periodo);
  const priorMeses = desplazarMeses(periodMeses, -12);
  const prevMes = mesPrevio(mes);
  const mesesTTM = ttm(mes);
  // Proximos 6 meses (relativos a hoy, no al mes seleccionado).
  const mesesForward = Array.from({ length: 6 }, (_, i) =>
    sumarMeses(mesPorDefecto(), i + 1),
  );
  const todos = Array.from(
    new Set([...periodMeses, ...priorMeses, ...mesesTTM, prevMes, ...mesesForward]),
  );
  const map = await unidadMesMap([u], todos);

  const de = (meses: string[]): UnidadMes[] =>
    meses.map((m) => map.get(`${u.listingId}|${m}`)).filter((x): x is UnidadMes => !!x);

  const rAct = sumar(de(periodMeses));
  const rPrev = sumar(de([prevMes]));
  const rPrior = sumar(de(priorMeses));
  const esMes = periodo === "mes";
  const occ = ocupacionDe(rAct);
  const adr = adrDe(rAct);
  const revpar = revparDe(rAct);

  const nt = noiTTM(u, map, mesesTTM);
  const rendChip = semaforoRentabilidad(u.tipo, nt.yieldPct, nt.margenPct);

  const serie = seriePnL(map, [u], mesesTTM);
  const serieChart = serie.map((s) => ({ mes: s.mes, ingresos: s.brutos, noi: s.noi }));

  const { desde, hastaExcl } = rangoFechas(periodMeses);
  const [mix, fwd, stats, reservas, costes, revResumen, revNo5, cleanCost, opexCats] =
    await Promise.all([
      mixCanales(periodMeses, u.listingId),
      forwardKpis([u.listingId]),
      statsReservas(periodMeses, u.listingId),
      reservasDelMes(u.listingId, mes),
      costesDetalle(u.nickname, mes),
      resumenReviews(u.listingId, desde, hastaExcl),
      reviewsNo5(u.listingId, desde, hastaExcl),
      costesLimpieza(periodMeses, u.nickname),
      costesPorCategoria(periodMeses, u.nickname),
    ]);

  // Vision futura de la unidad: ventanas OTB y consejos de revenue.
  const fwdVentanas = fwd.porUnidad.get(u.listingId) ?? [];
  const insightsFwd = generarInsightsForward(fwdVentanas, []);
  const mesesFwdFilas: MesForward[] = mesesForward.map((m) => {
    const r = sumar(de([m]));
    return {
      mes: m,
      noches: r.vendidas,
      disponibles: r.disponibles,
      occ: ocupacionDe(r),
      adr: adrDe(r),
      revpar: revparDe(r),
      revenue: r.alojamiento,
    };
  });

  const etiqueta = etiquetaPeriodo(mes, periodo);
  const margenNOI = rAct.brutos > 0 ? rAct.noi / rAct.brutos : null;
  const margenPrior = rPrior.brutos > 0 ? rPrior.noi / rPrior.brutos : null;
  const baseLimp = rAct.alojamiento + rAct.limpieza;
  const comisionLimpieza = baseLimp > 0 ? (rAct.comisiones * rAct.limpieza) / baseLimp : 0;

  const limpiezaNeta = rAct.limpieza - cleanCost - comisionLimpieza;
  const tipoLabel =
    u.tipo === "propiedad" ? "Propiedad" : u.tipo === "master_lease" ? "Master lease" : "Tipo sin definir";
  const detalleTipo =
    u.tipo === "propiedad" && u.costeAdquisicion
      ? ` · adquisición ${eur(u.costeAdquisicion)}`
      : u.tipo === "master_lease" && u.rentaMensual
        ? ` · renta ${eur(u.rentaMensual)}/mes`
        : "";
  const rendimiento =
    u.tipo === "propiedad" && nt.yieldPct !== null && rendChip ? (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-card">
        <span className="text-xs font-medium text-muted">NOI yield 12 meses</span>
        <Chip estado={rendChip}>{pctDirecto(nt.yieldPct)}</Chip>
        <span className="text-xs text-faint">objetivo 9-11%</span>
      </div>
    ) : u.tipo === "master_lease" && nt.margenPct !== null && rendChip ? (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-card">
        <span className="text-xs font-medium text-muted">Margen NOI 12 meses</span>
        <Chip estado={rendChip}>{pctDirecto(nt.margenPct)}</Chip>
      </div>
    ) : undefined;

  return (
    <AppShell
      titulo={u.displayName}
      subtitulo={`${tipoLabel}${detalleTipo} · ${etiqueta}`}
      acciones={rendimiento}
      contexto={{ mes, periodo, unidades: opts, unidadId: u.listingId }}
      estado={estado}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Ocupación" value={pct(occ)}
          sub={`${num(rAct.vendidas)} de ${num(rAct.disponibles)} noches${rAct.bloqueadas > 0 ? ` · ${num(rAct.bloqueadas)} bloqueadas` : ""}`}
          deltaMoM={esMes ? delta(occ, ocupacionDe(rPrev)) : undefined}
          deltaYoY={delta(occ, ocupacionDe(rPrior))} />
        <KpiCard label="ADR" value={eur(adr)}
          sub={stats.estanciaMedia ? `Estancia media ${stats.estanciaMedia.toFixed(1).replace(".", ",")} noches` : undefined}
          deltaMoM={esMes ? delta(adr, adrDe(rPrev)) : undefined}
          deltaYoY={delta(adr, adrDe(rPrior))} />
        <KpiCard label="RevPAR" value={eur(revpar)}
          sub={stats.leadTimeMedio ? `Ventana de reserva ${Math.round(stats.leadTimeMedio)} días` : undefined}
          deltaMoM={esMes ? delta(revpar, revparDe(rPrev)) : undefined}
          deltaYoY={delta(revpar, revparDe(rPrior))} />
        <KpiCard label="Ingresos netos" value={eur(rAct.netos)}
          sub={`Brutos ${eur(rAct.brutos)}`}
          deltaMoM={esMes ? delta(rAct.netos, rPrev.netos) : undefined}
          deltaYoY={delta(rAct.netos, rPrior.netos)} />
        <KpiCard label="NOI" value={eur(rAct.noi)}
          sub={rAct.limpieza > 0 ? `Limpieza neta ${eur(limpiezaNeta)}` : undefined}
          deltaMoM={esMes ? delta(rAct.noi, rPrev.noi) : undefined}
          deltaYoY={delta(rAct.noi, rPrior.noi)} />
        <KpiCard label="Margen NOI" value={pct(margenNOI)}
          deltaMoM={esMes ? delta(margenNOI, rPrev.brutos > 0 ? rPrev.noi / rPrev.brutos : null) : undefined}
          deltaYoY={delta(margenNOI, margenPrior)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader titulo="Ingresos y NOI" descripcion="Últimos 12 meses" />
          <NoiRevenueChart data={serieChart} />
        </Card>
        <Card>
          <CardHeader titulo="Mix de canales" descripcion={etiqueta} />
          <ChannelTable data={mix} />
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Visión futura"
          descripcion="Ocupación y ADR ya reservados, frente al mismo punto del año pasado"
        />
        <ForwardOutlook ventanas={fwdVentanas} />
        {insightsFwd.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2.5 text-sm font-semibold text-ink">Consejos de revenue</h3>
            <Insights insights={insightsFwd} />
          </div>
        )}
        <div className="mt-5">
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Próximos 6 meses</h3>
          <ForwardMeses filas={mesesFwdFilas} />
        </div>
      </Card>

      <Card>
        <CardHeader titulo="Reviews" descripcion={etiqueta} />
        <ReviewsCard resumen={revResumen} no5={revNo5} />
      </Card>

      <Card>
        <CardHeader
          titulo="P&L mensual"
          descripcion="Últimos 12 meses"
          accion={
            <LinkFlecha href={`/pnl?mes=${mes}&periodo=ttm&unidad=${u.listingId}`}>
              Ver hasta caja
            </LinkFlecha>
          }
        />
        <PnLTable serie={serie} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            titulo="Desglose de costes"
            descripcion={`${etiqueta}${rAct.limpieza > 0 ? ` · limpieza neta ${eur(limpiezaNeta)} (${pct(limpiezaNeta / rAct.limpieza)})` : ""}`}
          />
          <OpexDetalle categorias={opexCats} ingresos={rAct.brutos} />
        </Card>
        <Card>
          <CardHeader titulo="Costes del mes" descripcion={mesLabel(mes)} />
          <CostBreakdown costes={costes} />
        </Card>
      </div>

      <Card>
        <CardHeader titulo="Reservas" descripcion={`Estancias con noches en ${mesLabel(mes)}`} />
        <ReservationsList reservas={reservas} />
      </Card>
    </AppShell>
  );
}
