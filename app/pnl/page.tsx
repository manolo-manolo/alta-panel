import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import { Card, SectionTitle, MiniStat } from "@/components/ui";
import PnLTable from "@/components/PnLTable";
import OpexDetalle from "@/components/OpexDetalle";
import { eur, pct, mesLabel } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  seriePnL,
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

  const totalTTM = serie.reduce(
    (a, m) => ({ ing: a.ing + m.brutos, noi: a.noi + m.noi }),
    { ing: 0, noi: 0 },
  );

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
        </div>

        <Card>
          <SectionTitle>
            P&amp;L mensual · {sel ? sel.displayName : "portfolio"} · 12 meses hasta {mesLabel(mes)}
          </SectionTitle>
          <PnLTable serie={serie} />
        </Card>

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
