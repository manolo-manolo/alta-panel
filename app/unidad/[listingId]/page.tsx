import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, KpiCard, SectionTitle, Chip, MiniStat } from "@/components/ui";
import NoiRevenueChart from "@/components/charts/NoiRevenueChart";
import ChannelTable from "@/components/ChannelTable";
import PacingStrip from "@/components/PacingStrip";
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
  pacing,
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
      <div className="min-h-screen">
        <TopBar mes={mes} periodo={periodo} unidades={opts} ultimaActualizacion={estado.ultimoExito} />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <SetupNotice titulo="Unidad no encontrada" />
        </main>
      </div>
    );
  }

  const periodMeses = mesesDePeriodo(mes, periodo);
  const priorMeses = desplazarMeses(periodMeses, -12);
  const prevMes = mesPrevio(mes);
  const mesesTTM = ttm(mes);
  const todos = Array.from(new Set([...periodMeses, ...priorMeses, ...mesesTTM, prevMes]));
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
  const [mix, pac, stats, reservas, costes, revResumen, revNo5, cleanCost, opexCats] =
    await Promise.all([
      mixCanales(periodMeses, u.listingId),
      pacing(u.listingId),
      statsReservas(periodMeses, u.listingId),
      reservasDelMes(u.listingId, mes),
      costesDetalle(u.nickname, mes),
      resumenReviews(u.listingId, desde, hastaExcl),
      reviewsNo5(u.listingId, desde, hastaExcl),
      costesLimpieza(periodMeses, u.nickname),
      costesPorCategoria(periodMeses, u.nickname),
    ]);

  const etiqueta = etiquetaPeriodo(mes, periodo);
  const margenNOI = rAct.brutos > 0 ? rAct.noi / rAct.brutos : null;
  const margenPrior = rPrior.brutos > 0 ? rPrior.noi / rPrior.brutos : null;
  const baseLimp = rAct.alojamiento + rAct.limpieza;
  const comisionLimpieza = baseLimp > 0 ? (rAct.comisiones * rAct.limpieza) / baseLimp : 0;

  return (
    <div className="min-h-screen">
      <TopBar mes={mes} periodo={periodo} unidades={opts} unidadId={u.listingId} ultimaActualizacion={estado.ultimoExito} />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-ink">{u.displayName}</h1>
            <p className="text-sm text-muted">
              {u.tipo === "propiedad" ? "Propiedad" : u.tipo === "master_lease" ? "Master lease" : "Tipo no definido"}
              {u.tipo === "propiedad" && u.costeAdquisicion ? ` · adquisicion ${eur(u.costeAdquisicion)}` : ""}
              {u.tipo === "master_lease" && u.rentaMensual ? ` · renta ${eur(u.rentaMensual)}/mes` : ""}
              {" · "}{etiqueta} ({mesLabel(mes)})
            </p>
          </div>
          <div className="text-right">
            {u.tipo === "propiedad" && nt.yieldPct !== null && rendChip && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">NOI yield TTM</span>
                <Chip estado={rendChip}>{pctDirecto(nt.yieldPct)}</Chip>
                <span className="text-xs text-faint">objetivo 9-11%</span>
              </div>
            )}
            {u.tipo === "master_lease" && nt.margenPct !== null && rendChip && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Margen NOI TTM</span>
                <Chip estado={rendChip}>{pctDirecto(nt.margenPct)}</Chip>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KpiCard label="Ocupacion" value={pct(occ)}
            deltaMoM={esMes ? delta(occ, ocupacionDe(rPrev)) : undefined}
            deltaYoY={delta(occ, ocupacionDe(rPrior))} />
          <KpiCard label="ADR" value={eur(adr)}
            deltaMoM={esMes ? delta(adr, adrDe(rPrev)) : undefined}
            deltaYoY={delta(adr, adrDe(rPrior))} />
          <KpiCard label="RevPAR" value={eur(revpar)}
            deltaMoM={esMes ? delta(revpar, revparDe(rPrev)) : undefined}
            deltaYoY={delta(revpar, revparDe(rPrior))} />
          <KpiCard label="Ingresos netos" value={eur(rAct.netos)}
            deltaMoM={esMes ? delta(rAct.netos, rPrev.netos) : undefined}
            deltaYoY={delta(rAct.netos, rPrior.netos)} />
          <KpiCard label="NOI" value={eur(rAct.noi)}
            deltaMoM={esMes ? delta(rAct.noi, rPrev.noi) : undefined}
            deltaYoY={delta(rAct.noi, rPrior.noi)} />
          <KpiCard label="Margen NOI" value={pct(margenNOI)}
            deltaMoM={esMes ? delta(margenNOI, rPrev.brutos > 0 ? rPrev.noi / rPrev.brutos : null) : undefined}
            deltaYoY={delta(margenNOI, margenPrior)} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Noches vendidas" value={num(rAct.vendidas)} />
          <MiniStat label="Noches bloqueadas" value={num(rAct.bloqueadas)} />
          <MiniStat label="Estancia media" value={stats.estanciaMedia ? `${stats.estanciaMedia.toFixed(1)} noches` : "-"} />
          <MiniStat label="Ventana de reserva" value={stats.leadTimeMedio ? `${Math.round(stats.leadTimeMedio)} dias` : "-"} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>Ingresos y NOI (ultimos 12 meses)</SectionTitle>
            <NoiRevenueChart data={serieChart} />
          </Card>
          <Card>
            <SectionTitle>Mix de canales · {etiqueta}</SectionTitle>
            <ChannelTable data={mix} />
          </Card>
        </div>

        <Card>
          <SectionTitle>Pacing</SectionTitle>
          <PacingStrip pacing={pac} />
        </Card>

        <Card>
          <SectionTitle>Reviews · {etiqueta}</SectionTitle>
          <ReviewsCard resumen={revResumen} no5={revNo5} />
        </Card>

        <Card>
          <SectionTitle>P&amp;L mensual (ultimos 12 meses)</SectionTitle>
          <PnLTable serie={serie} />
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="Margen NOI" value={pct(margenNOI)} />
          <MiniStat
            label="Limpieza neta"
            value={`${eur(rAct.limpieza - cleanCost - comisionLimpieza)}${rAct.limpieza > 0 ? ` (${pct((rAct.limpieza - cleanCost - comisionLimpieza) / rAct.limpieza)})` : ""}`}
          />
        </div>
        <Card>
          <SectionTitle>Desglose de costes · {etiqueta}</SectionTitle>
          <OpexDetalle categorias={opexCats} />
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>Reservas ({mesLabel(mes)})</SectionTitle>
            <ReservationsList reservas={reservas} />
          </Card>
          <Card>
            <SectionTitle>Costes ({mesLabel(mes)})</SectionTitle>
            <CostBreakdown costes={costes} />
          </Card>
        </div>
      </main>
    </div>
  );
}
