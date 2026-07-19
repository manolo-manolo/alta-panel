import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, KpiCard, SectionTitle } from "@/components/ui";
import NoiRevenueChart from "@/components/charts/NoiRevenueChart";
import ChannelDonut from "@/components/charts/ChannelDonut";
import PacingStrip from "@/components/PacingStrip";
import PnLTable from "@/components/PnLTable";
import UnitsTable, { type FilaUnidad } from "@/components/UnitsTable";
import { estadoUnidad } from "@/lib/status";
import { eur, num, pct, mesLabel, delta } from "@/lib/format";
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
  ttm,
  mesPorDefecto,
  mesPrevio,
  mesAnoAnterior,
  type UnidadMes,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesPorDefecto();

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  let unidades;
  try {
    unidades = await getUnidades();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Error de base de datos en portfolio:", e);
    return (
      <Shell mes={mes} unidades={[]} ultima={estado.ultimoExito}>
        <SetupNotice
          titulo="Base de datos no disponible"
          detalle={`Detalle tecnico: ${msg}`}
        />
      </Shell>
    );
  }

  if (unidades.length === 0) {
    return (
      <Shell mes={mes} unidades={[]} ultima={estado.ultimoExito}>
        <Banner estado={estado} />
        <SetupNotice titulo="Todavia no hay unidades sincronizadas" />
      </Shell>
    );
  }

  const mesesTTM = ttm(mes);
  const meses = Array.from(new Set([...mesesTTM, mesAnoAnterior(mes)]));
  const map = await unidadMesMap(unidades, meses);

  const itemsDe = (m: string): UnidadMes[] =>
    unidades
      .map((u) => map.get(`${u.listingId}|${m}`))
      .filter((x): x is UnidadMes => !!x);

  const rMes = sumar(itemsDe(mes));
  const rPrev = sumar(itemsDe(mesPrevio(mes)));
  const rLY = sumar(itemsDe(mesAnoAnterior(mes)));

  const occ = ocupacionDe(rMes);
  const adr = adrDe(rMes);
  const revpar = revparDe(rMes);

  const serie = seriePnL(map, unidades, mesesTTM);
  const serieChart = serie.map((s) => ({ mes: s.mes, ingresos: s.brutos, noi: s.noi }));

  const [mix, pac] = await Promise.all([mixCanales(mes), pacing()]);

  const unidadesActivas = unidades.filter((u) => u.activo).length;

  const filas: FilaUnidad[] = unidades.map((u) => {
    const um = map.get(`${u.listingId}|${mes}`)!;
    const nt = noiTTM(u, map, mesesTTM);
    const rendimiento =
      u.tipo === "propiedad" ? nt.yieldPct : u.tipo === "master_lease" ? nt.margenPct : null;
    return {
      listingId: u.listingId,
      nickname: u.displayName,
      tipo: u.tipo,
      ocupacion: um.ocupacion,
      adr: um.adr,
      revpar: um.revpar,
      netos: um.netos,
      noiMes: um.noi,
      noiTTM: nt.noiTTM,
      rendimiento,
      rendimientoTipo:
        u.tipo === "propiedad" ? "yield" : u.tipo === "master_lease" ? "margen" : null,
      estado: estadoUnidad({
        tipo: u.tipo,
        ocupacion: um.ocupacion,
        mediaOcupacion: occ,
        yieldPct: nt.yieldPct,
        margenPct: nt.margenPct,
      }),
      costesPendientes: um.costesPendientes,
    };
  });

  return (
    <Shell mes={mes} unidades={unidades} ultima={estado.ultimoExito}>
      <Banner estado={estado} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard
          label="Ocupacion"
          value={pct(occ)}
          deltaMoM={delta(occ, ocupacionDe(rPrev))}
          deltaYoY={delta(occ, ocupacionDe(rLY))}
        />
        <KpiCard
          label="ADR"
          value={eur(adr)}
          deltaMoM={delta(adr, adrDe(rPrev))}
          deltaYoY={delta(adr, adrDe(rLY))}
        />
        <KpiCard
          label="RevPAR"
          value={eur(revpar)}
          deltaMoM={delta(revpar, revparDe(rPrev))}
          deltaYoY={delta(revpar, revparDe(rLY))}
        />
        <KpiCard
          label="Ingresos netos"
          value={eur(rMes.netos)}
          deltaMoM={delta(rMes.netos, rPrev.netos)}
          deltaYoY={delta(rMes.netos, rLY.netos)}
        />
        <KpiCard
          label="NOI"
          value={eur(rMes.noi)}
          deltaMoM={delta(rMes.noi, rPrev.noi)}
          deltaYoY={delta(rMes.noi, rLY.noi)}
        />
        <KpiCard
          label="Unidades activas"
          value={num(unidadesActivas)}
          sub={`${num(rMes.vendidas)} noches vendidas`}
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
        <SectionTitle>Pacing (noches y revenue en cartera)</SectionTitle>
        <PacingStrip pacing={pac} />
      </Card>

      <Card>
        <SectionTitle>Unidades ({mesLabel(mes)})</SectionTitle>
        <UnitsTable filas={filas} mes={mes} />
      </Card>

      <Card>
        <SectionTitle>P&amp;L del portfolio (ultimos 12 meses)</SectionTitle>
        <PnLTable serie={serie} />
      </Card>
    </Shell>
  );
}

function Shell({
  mes,
  unidades,
  ultima,
  children,
}: {
  mes: string;
  unidades: { listingId: string; displayName: string }[];
  ultima: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={ultima}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        {children}
      </main>
    </div>
  );
}
