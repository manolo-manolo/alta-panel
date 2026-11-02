import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader } from "@/components/ui";
import InsightItem from "@/components/InsightItem";
import UnitsCommandTable, { type FilaMando } from "@/components/UnitsCommandTable";
import ForwardMatrix, { type FilaForward } from "@/components/ForwardMatrix";
import { seriePnLCash, breakEvenOcc } from "@/lib/finance";
import {
  cargarContexto,
  datosUnidad,
  accionesDeUnidad,
  finDe,
  itemsUnidad,
} from "@/lib/acciones";
import type { AccionUnidad } from "@/lib/unit-actions";
import { eur } from "@/lib/format";
import {
  sumar,
  ocupacionDe,
  adrDe,
  revparDe,
  noiTTM,
  estadoDatos,
  mesPorDefecto,
  etiquetaPeriodo,
  type Periodo,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
const PERIODOS = ["mes", "ytd", "ttm", "ano"];

export default async function UnidadesPage({
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

  const ctx = await cargarContexto(mes, periodo);
  const { unidades, map, mesesTTM, periodMeses } = ctx;
  if (unidades.length === 0) {
    return (
      <AppShell titulo="Unidades" estado={estado} mes={mes} periodo={periodo}>
        <SetupNotice titulo="Todavía no hay unidades sincronizadas" />
      </AppShell>
    );
  }

  const rPortfolio = sumar(unidades.flatMap((u) => itemsUnidad(map, u, periodMeses)));
  const occPortfolio = ocupacionDe(rPortfolio);

  const filas: FilaMando[] = [];
  const accionesPorUnidad: {
    listingId: string;
    nombre: string;
    acciones: AccionUnidad[];
    potencial: number;
  }[] = [];

  for (const u of unidades) {
    const d = datosUnidad(ctx, u);
    filas.push({
      listingId: u.listingId,
      nombre: u.displayName,
      tipo: u.tipo,
      occ: ocupacionDe(d.r),
      adr: adrDe(d.r),
      revpar: revparDe(d.r),
      netos: d.r.netos,
      noi: d.r.noi,
      caja: d.caja,
      rendimiento: u.tipo === "propiedad" ? d.nt.yieldPct : u.tipo === "master_lease" ? d.nt.margenPct : null,
      rendimientoTipo: u.tipo === "propiedad" ? "yield" : u.tipo === "master_lease" ? "margen" : null,
      occBreakEven: d.occBreakEven,
      occTTM: ocupacionDe(d.rTTM),
      rating90: d.rating?.media ?? null,
      numReviews90: d.rating?.n ?? 0,
      otbOcc: d.v30?.occ ?? null,
      otbOccSTLY: d.v30?.occSTLY ?? null,
      otbNoches: d.v30?.noches ?? 0,
      otbDisponibles: d.v30?.disponibles ?? 0,
      costesPendientes: d.costesPendientes,
    });

    const acciones = accionesDeUnidad(ctx, u, d);
    if (acciones.length > 0) {
      accionesPorUnidad.push({
        listingId: u.listingId,
        nombre: u.displayName,
        acciones,
        potencial: acciones
          .filter((a) => a.tono !== "info")
          .reduce((s, a) => s + (a.impacto ?? 0), 0),
      });
    }
  }
  accionesPorUnidad.sort((a, b) => b.potencial - a.potencial);

  // Fila total del portfolio.
  const rTTMp = sumar(unidades.flatMap((u) => itemsUnidad(map, u, mesesTTM)));
  const cashPortfolio = seriePnLCash(
    ctx.seriePortfolioPeriodo,
    ctx.seriePortfolioPeriodo,
    unidades.map(finDe),
    unidades.length,
  );
  const cashTTMp = seriePnLCash(
    ctx.seriePortfolioTTM,
    ctx.seriePortfolioTTM,
    unidades.map(finDe),
    unidades.length,
  );
  const ratingTot = [...ctx.ratings.values()].reduce(
    (a, r) => ({ suma: a.suma + r.media * r.n, n: a.n + r.n }),
    { suma: 0, n: 0 },
  );
  const costeOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + (u.costeAdquisicion ?? 0), 0);
  const noiTTMOwned = unidades
    .filter((u) => u.tipo === "propiedad" && u.costeAdquisicion)
    .reduce((s, u) => s + noiTTM(u, map, mesesTTM).noiTTM, 0);
  const v30Port = ctx.fwd.portfolio.find((v) => v.dias === 30);
  const total: FilaMando = {
    listingId: "__total__",
    nombre: "Portfolio",
    tipo: null,
    occ: occPortfolio,
    adr: adrDe(rPortfolio),
    revpar: revparDe(rPortfolio),
    netos: rPortfolio.netos,
    noi: rPortfolio.noi,
    caja: cashPortfolio.reduce((s, m) => s + m.caja, 0),
    rendimiento: costeOwned > 0 ? (noiTTMOwned / costeOwned) * 100 : null,
    rendimientoTipo: "yield",
    occBreakEven: breakEvenOcc({
      netos: rTTMp.netos,
      costesVariables: rTTMp.costesVariables,
      costesFijos: rTTMp.costesFijos,
      vendidas: rTTMp.vendidas,
      disponibles: rTTMp.disponibles,
      overhead: cashTTMp.reduce((s, m) => s + m.overhead, 0),
      servicioDeuda: cashTTMp.reduce((s, m) => s + m.intereses + m.principal, 0),
    }),
    occTTM: ocupacionDe(rTTMp),
    rating90: ratingTot.n > 0 ? ratingTot.suma / ratingTot.n : null,
    numReviews90: ratingTot.n,
    otbOcc: v30Port?.occ ?? null,
    otbOccSTLY: v30Port?.occSTLY ?? null,
    otbNoches: v30Port?.noches ?? 0,
    otbDisponibles: v30Port?.disponibles ?? 0,
    costesPendientes: false,
  };

  const etiqueta = etiquetaPeriodo(mes, periodo);
  const potencialTotal = accionesPorUnidad.reduce((s, a) => s + a.potencial, 0);

  // Ocupacion y ADR futuros por unidad (on the books).
  const ventanasFila = (ventanas: typeof ctx.fwd.portfolio) =>
    ventanas.map((v) => ({
      dias: v.dias,
      occ: v.occ,
      adr: v.adr,
      occSTLY: v.occSTLY,
      adrSTLY: v.adrSTLY,
      noches: v.noches,
      disponibles: v.disponibles,
      revenue: v.revenue,
    }));
  const filasFwd: FilaForward[] = unidades.map((u) => ({
    listingId: u.listingId,
    nombre: u.displayName,
    ventanas: ventanasFila(ctx.fwd.porUnidad.get(u.listingId) ?? []),
  }));
  const totalFwd: FilaForward = {
    listingId: "__total__",
    nombre: "Portfolio",
    ventanas: ventanasFila(ctx.fwd.portfolio),
  };

  return (
    <AppShell
      titulo="Unidades"
      subtitulo={`${etiqueta} · ${unidades.length} unidades`}
      contexto={{ mes, periodo }}
      estado={estado}
    >
      <Card>
        <CardHeader
          titulo="Cuadro de mando"
          descripcion="Operación, resultado, rendimiento, reviews y cartera de cada unidad"
        />
        <UnitsCommandTable filas={filas} total={total} mes={mes} />
      </Card>

      <Card>
        <CardHeader
          titulo="Acciones por unidad"
          descripcion="Ordenadas por euros estimados"
          accion={
            potencialTotal > 0 ? (
              <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-sm text-brand-ink">
                Potencial ≈ <span className="tabular font-semibold">{eur(potencialTotal)}</span>
              </span>
            ) : undefined
          }
        />
        {accionesPorUnidad.length === 0 ? (
          <p className="text-sm text-muted">Sin acciones pendientes: todo en banda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-5 gap-y-6 lg:grid-cols-2">
            {accionesPorUnidad.map((a) => (
              <div key={a.listingId}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <a
                    href={`/unidad/${a.listingId}?mes=${mes}&periodo=${periodo}`}
                    className="text-sm font-semibold text-ink transition hover:text-brand"
                  >
                    {a.nombre}
                  </a>
                  {a.potencial > 0 && (
                    <span className="tabular text-xs font-medium text-muted">≈ {eur(a.potencial)}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {a.acciones.map((it, i) => (
                    <InsightItem key={i} tono={it.tono} texto={it.texto} impacto={it.impacto} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-faint">
          Euros estimados con supuestos conservadores (subida del 10% sobre noches por vender,
          relleno parcial de huecos y noches libres, margen por noche real de cada unidad). Son
          órdenes de magnitud para priorizar, no previsiones.
        </p>
      </Card>

      <Card>
        <div id="futuro" className="scroll-mt-20" />
        <CardHeader
          titulo="Ocupación y ADR futuros"
          descripcion="Lo ya reservado para los próximos 15, 30, 60 y 90 días en cada unidad"
        />
        <ForwardMatrix filas={filasFwd} total={totalFwd} mes={mes} />
      </Card>
    </AppShell>
  );
}
