import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, KpiCard, SectionTitle, Chip } from "@/components/ui";
import NoiRevenueChart from "@/components/charts/NoiRevenueChart";
import ChannelDonut from "@/components/charts/ChannelDonut";
import PacingStrip from "@/components/PacingStrip";
import PnLTable from "@/components/PnLTable";
import ReservationsList from "@/components/ReservationsList";
import CostBreakdown from "@/components/CostBreakdown";
import ReviewsCard from "@/components/ReviewsCard";
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
  resumenReviews,
  reviewsNo5,
  ttm,
  mesPorDefecto,
  mesPrevio,
  mesAnoAnterior,
  type UnidadMes,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function UnidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireSesion();
  const { listingId } = await params;
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const unidades = await getUnidades();
  const u = unidades.find((x) => x.listingId === listingId);

  if (!u) {
    return (
      <div className="min-h-screen">
        <TopBar
          mes={mes}
          unidades={unidades.map((x) => ({ listingId: x.listingId, nombre: x.displayName }))}
          ultimaActualizacion={estado.ultimoExito}
        />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <SetupNotice titulo="Unidad no encontrada" />
        </main>
      </div>
    );
  }

  const mesesTTM = ttm(mes);
  const meses = Array.from(new Set([...mesesTTM, mesAnoAnterior(mes)]));
  const map = await unidadMesMap([u], meses);

  const de = (m: string): UnidadMes[] => {
    const x = map.get(`${u.listingId}|${m}`);
    return x ? [x] : [];
  };

  const rMes = sumar(de(mes));
  const rPrev = sumar(de(mesPrevio(mes)));
  const rLY = sumar(de(mesAnoAnterior(mes)));
  const um = map.get(`${u.listingId}|${mes}`)!;

  const nt = noiTTM(u, map, mesesTTM);
  const rendChip = semaforoRentabilidad(u.tipo, nt.yieldPct, nt.margenPct);

  const serie = seriePnL(map, [u], mesesTTM);
  const serieChart = serie.map((s) => ({ mes: s.mes, ingresos: s.brutos, noi: s.noi }));

  const [mix, pac, stats, reservas, costes, revResumen, revNo5] = await Promise.all([
    mixCanales(mes, u.listingId),
    pacing(u.listingId),
    statsReservas(mes, u.listingId),
    reservasDelMes(u.listingId, mes),
    costesDetalle(u.nickname, mes),
    resumenReviews(u.listingId),
    reviewsNo5(u.listingId),
  ]);

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        unidades={unidades.map((x) => ({ listingId: x.listingId, nombre: x.displayName }))}
        unidadId={u.listingId}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        {/* Cabecera de unidad */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-ink">{u.displayName}</h1>
            <p className="text-sm text-muted">
              {u.tipo === "propiedad"
                ? "Propiedad"
                : u.tipo === "master_lease"
                  ? "Master lease"
                  : "Tipo no definido en la hoja"}
              {u.tipo === "propiedad" && u.costeAdquisicion
                ? ` · adquisicion ${eur(u.costeAdquisicion)}`
                : ""}
              {u.tipo === "master_lease" && u.rentaMensual
                ? ` · renta ${eur(u.rentaMensual)}/mes`
                : ""}
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

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Ocupacion" value={pct(um.ocupacion)}
            deltaMoM={delta(um.ocupacion, ocupacionDe(rPrev))}
            deltaYoY={delta(um.ocupacion, ocupacionDe(rLY))} />
          <KpiCard label="ADR" value={eur(um.adr)}
            deltaMoM={delta(um.adr, adrDe(rPrev))}
            deltaYoY={delta(um.adr, adrDe(rLY))} />
          <KpiCard label="RevPAR" value={eur(um.revpar)}
            deltaMoM={delta(um.revpar, revparDe(rPrev))}
            deltaYoY={delta(um.revpar, revparDe(rLY))} />
          <KpiCard label="Ingresos netos" value={eur(rMes.netos)}
            deltaMoM={delta(rMes.netos, rPrev.netos)}
            deltaYoY={delta(rMes.netos, rLY.netos)} />
          <KpiCard label="NOI" value={eur(rMes.noi)}
            deltaMoM={delta(rMes.noi, rPrev.noi)}
            deltaYoY={delta(rMes.noi, rLY.noi)} />
        </div>

        {/* Stats de estancia */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Noches vendidas" value={num(um.vendidas)} />
          <MiniStat label="Noches bloqueadas" value={num(um.bloqueadas)} />
          <MiniStat
            label="Estancia media"
            value={stats.estanciaMedia ? `${stats.estanciaMedia.toFixed(1)} noches` : "-"}
          />
          <MiniStat
            label="Ventana de reserva"
            value={stats.leadTimeMedio ? `${Math.round(stats.leadTimeMedio)} dias` : "-"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>Ingresos y NOI (ultimos 12 meses)</SectionTitle>
            <NoiRevenueChart data={serieChart} />
          </Card>
          <Card>
            <SectionTitle>Mix de canales ({mesLabel(mes)})</SectionTitle>
            <ChannelDonut data={mix} />
          </Card>
        </div>

        <Card>
          <SectionTitle>Pacing</SectionTitle>
          <PacingStrip pacing={pac} />
        </Card>

        <Card>
          <SectionTitle>Reviews (historico)</SectionTitle>
          <ReviewsCard resumen={revResumen} no5={revNo5} />
        </Card>

        <Card>
          <SectionTitle>P&amp;L mensual (ultimos 12 meses)</SectionTitle>
          <PnLTable serie={serie} />
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="tabular mt-1 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}
