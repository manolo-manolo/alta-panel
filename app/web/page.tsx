import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import { Card, KpiCard, SectionTitle, MiniStat } from "@/components/ui";
import Insights from "@/components/Insights";
import VisitorsChart from "@/components/charts/VisitorsChart";
import {
  webConfig,
  ga4Totales,
  ga4Serie,
  ga4TopPaginas,
  ga4Canales,
  ga4Paises,
  ga4Dispositivos,
  ga4Eventos,
  eventosDeReserva,
  gscSerie,
  gscTopConsultas,
  gscTopPaginas,
  reservasDirectas,
  reservasDirectasPorUnidad,
  esPaginaApartamento,
  slugUnidad,
  type Ga4Totales,
  type PuntoVisitas,
  type PaginaTop,
  type DimValor,
  type EventoConteo,
  type PuntoGsc,
  type GscConsulta,
  type GscPagina,
} from "@/lib/web-analytics";
import { generarInsightsWeb, type PaginaApartamentoResumen } from "@/lib/web-insights";
import { getUnidades, estadoDatos, mesPorDefecto } from "@/lib/metrics";
import { eur, num, pct, delta } from "@/lib/format";

export const dynamic = "force-dynamic";

const DIAS = 28; // ventana de KPIs
const DIAS_SERIE = 84; // ventana del grafico

interface DatosGa4 {
  totales: Ga4Totales;
  serie: PuntoVisitas[];
  paginas: PaginaTop[];
  canales: DimValor[];
  paises: DimValor[];
  dispositivos: DimValor[];
  eventos: EventoConteo[];
}

interface DatosGsc {
  serie: PuntoGsc[];
  consultas: GscConsulta[];
  paginas: GscPagina[];
}

export default async function WebPage() {
  await requireSesion();
  const mes = mesPorDefecto();

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  let unidades: { listingId: string; displayName: string; nickname: string }[] = [];
  try {
    unidades = await getUnidades();
  } catch {
    unidades = [];
  }

  const config = webConfig();

  // Reservas directas: siempre disponibles (vienen de Guesty/BD).
  let directas = { creadas: 0, creadasPrev: 0, revenue: 0 };
  let directasPorUnidad = new Map<string, number>();
  try {
    [directas, directasPorUnidad] = await Promise.all([
      reservasDirectas(DIAS),
      reservasDirectasPorUnidad(DIAS),
    ]);
  } catch {
    // sin BD no hay funnel, pero la pagina sigue funcionando
  }

  // GA4 y GSC: cada bloque falla por separado sin tumbar la pagina.
  let ga4: DatosGa4 | null = null;
  let errorGa4: string | null = null;
  if (config.ga4) {
    try {
      const [totales, serie, paginas, canales, paises, dispositivos, eventos] =
        await Promise.all([
          ga4Totales(DIAS),
          ga4Serie(DIAS_SERIE),
          ga4TopPaginas(DIAS, 50),
          ga4Canales(DIAS),
          ga4Paises(DIAS),
          ga4Dispositivos(DIAS),
          ga4Eventos(DIAS),
        ]);
      ga4 = { totales, serie, paginas, canales, paises, dispositivos, eventos };
    } catch (e) {
      errorGa4 = e instanceof Error ? e.message : String(e);
    }
  }

  let gsc: DatosGsc | null = null;
  let errorGsc: string | null = null;
  if (config.gsc) {
    try {
      const [serie, consultas, paginas] = await Promise.all([
        gscSerie(DIAS_SERIE),
        gscTopConsultas(DIAS),
        gscTopPaginas(DIAS, 15),
      ]);
      gsc = { serie, consultas, paginas };
    } catch (e) {
      errorGsc = e instanceof Error ? e.message : String(e);
    }
  }

  // Fichas de apartamento: vistas y atribucion de reservas directas por unidad.
  const nombres = unidades.flatMap((u) => [u.displayName, u.nickname]);
  const fichas = (ga4?.paginas ?? []).filter((p) => esPaginaApartamento(p.path, nombres));
  const vistasFichas = fichas.reduce((s, p) => s + p.vistas, 0);
  const fichasSinConversion: PaginaApartamentoResumen[] = [];
  for (const f of fichas) {
    if (f.vistas < 20) continue;
    const unidad = unidades.find((u) => {
      const sl = slugUnidad(u.displayName);
      const sl2 = slugUnidad(u.nickname);
      return (sl.length >= 4 && f.path.toLowerCase().includes(sl)) ||
        (sl2.length >= 4 && f.path.toLowerCase().includes(sl2));
    });
    const reservasUnidad = unidad ? (directasPorUnidad.get(unidad.listingId) ?? 0) : null;
    // Solo se marca "sin conversion" cuando la ficha se puede atribuir a una
    // unidad concreta (o cuando no hay ninguna reserva directa en absoluto).
    if ((reservasUnidad !== null && reservasUnidad === 0) ||
        (reservasUnidad === null && directas.creadas === 0)) {
      fichasSinConversion.push({ path: f.path, vistas: f.vistas });
    }
  }

  const eventosReserva = ga4 ? eventosDeReserva(ga4.eventos) : [];
  const totalSesiones = ga4?.canales.reduce((s, c) => s + c.sesiones, 0) ?? 0;
  const canalTop = ga4 && totalSesiones > 0 && ga4.canales.length
    ? { nombre: ga4.canales[0].nombre, cuota: ga4.canales[0].sesiones / totalSesiones }
    : null;
  const totalDisp = ga4?.dispositivos.reduce((s, d) => s + d.visitantes, 0) ?? 0;
  const movil = ga4?.dispositivos.find((d) => d.nombre.toLowerCase() === "mobile");
  const movilCuota = ga4 && totalDisp > 0 && movil ? movil.visitantes / totalDisp : null;

  const insights = generarInsightsWeb({
    dias: DIAS,
    visitantes: ga4?.totales.visitantes ?? null,
    visitantesPrev: ga4?.totales.visitantesPrev ?? null,
    fichasSinConversion,
    canalTop,
    movilCuota,
    eventosReserva,
    reservasDirectas: directas.creadas,
    reservasDirectasPrev: directas.creadasPrev,
    revenueDirecto: directas.revenue,
    gscPaginasBajoCtr: (gsc?.paginas ?? [])
      .filter((p) => p.impresiones >= 200 && p.ctr < 0.015)
      .map((p) => ({ url: p.url, impresiones: p.impresiones, ctr: p.ctr })),
  });

  const conversion =
    ga4 && ga4.totales.visitantes > 0 ? directas.creadas / ga4.totales.visitantes : null;
  const sinConfigurar = !config.ga4 && !config.gsc;

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        periodo="mes"
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-ink">
            Web <span className="text-muted">· ultimos {DIAS} dias (grafico: {DIAS_SERIE})</span>
          </h1>
        </div>

        {sinConfigurar && <GuiaConexion />}
        {errorGa4 && (
          <Card>
            <SectionTitle>Google Analytics: error de conexion</SectionTitle>
            <p className="text-sm text-bad">{errorGa4}</p>
            <p className="mt-1 text-xs text-muted">
              Revisa GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY / GA4_PROPERTY_ID
              y que la service account este anadida a la propiedad de GA4 como lectora.
            </p>
          </Card>
        )}
        {errorGsc && (
          <Card>
            <SectionTitle>Search Console: error de conexion</SectionTitle>
            <p className="text-sm text-bad">{errorGsc}</p>
            <p className="mt-1 text-xs text-muted">
              Revisa GSC_SITE_URL (formato exacto de la propiedad, p. ej.
              sc-domain:tudominio.com) y que la service account tenga acceso en Search Console.
            </p>
          </Card>
        )}

        {(ga4 || directas.creadas > 0 || !sinConfigurar) && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard label="Visitantes" value={ga4 ? num(ga4.totales.visitantes) : "-"}
              deltaMoM={ga4 ? delta(ga4.totales.visitantes, ga4.totales.visitantesPrev) : undefined}
              etiquetaMoM="vs 28d ant." />
            <KpiCard label="Vistas de pagina" value={ga4 ? num(ga4.totales.vistas) : "-"}
              deltaMoM={ga4 ? delta(ga4.totales.vistas, ga4.totales.vistasPrev) : undefined}
              etiquetaMoM="vs 28d ant." />
            <KpiCard label="Vistas de apartamentos" value={ga4 ? num(vistasFichas) : "-"} />
            <KpiCard label="Reservas directas creadas" value={num(directas.creadas)}
              deltaMoM={delta(directas.creadas, directas.creadasPrev)}
              etiquetaMoM="vs 28d ant." />
            <KpiCard label="Revenue directo" value={eur(directas.revenue)} />
            <KpiCard label="Conversion a directa" value={conversion !== null ? pct(conversion) : "-"} />
          </div>
        )}

        {insights.length > 0 && (
          <Card>
            <SectionTitle>Consejos de la web</SectionTitle>
            <Insights insights={insights} />
          </Card>
        )}

        {ga4 && (
          <>
            <Card>
              <SectionTitle>Evolucion de visitantes</SectionTitle>
              <VisitorsChart
                data={ga4.serie.map((p) => ({ fecha: p.fecha, a: p.visitantes, b: p.vistas }))}
                labelA="Visitantes"
                labelB="Vistas"
              />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <SectionTitle>Paginas mas visitadas</SectionTitle>
                <TablaPaginas paginas={ga4.paginas.slice(0, 12)} nombres={nombres} />
              </Card>
              <div className="flex flex-col gap-4">
                <Card>
                  <SectionTitle>Fuentes de trafico</SectionTitle>
                  <TablaDim items={ga4.canales} total={totalSesiones} usarSesiones />
                </Card>
                <Card>
                  <SectionTitle>Paises</SectionTitle>
                  <TablaDim items={ga4.paises.slice(0, 6)} total={ga4.paises.reduce((s, x) => s + x.visitantes, 0)} />
                </Card>
                <Card>
                  <SectionTitle>Dispositivos</SectionTitle>
                  <TablaDim items={ga4.dispositivos} total={totalDisp} />
                </Card>
              </div>
            </div>

            <Card>
              <SectionTitle>Funnel de reserva (ultimos {DIAS} dias)</SectionTitle>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MiniStat label="1 · Visitantes" value={num(ga4.totales.visitantes)} />
                <MiniStat label="2 · Vistas de apartamentos" value={num(vistasFichas)} />
                <MiniStat
                  label="3 · Eventos de reserva/OTA"
                  value={eventosReserva.length ? num(eventosReserva.reduce((s, e) => s + e.conteo, 0)) : "sin eventos"}
                />
                <MiniStat label="4 · Reservas directas" value={`${num(directas.creadas)} (${eur(directas.revenue)})`} />
              </div>
              {eventosReserva.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Eventos detectados: {eventosReserva.map((e) => `${e.nombre} (${num(e.conteo)})`).join(" · ")}
                </p>
              )}
              <p className="mt-2 text-xs text-faint">
                Las reservas directas vienen de Guesty (canal directo, por fecha de creacion), asi
                que el paso 4 es real aunque falten eventos en GA4. Los clics de salida a
                Airbnb/Booking solo se pueden medir con un evento de GA4 en esos enlaces.
              </p>
            </Card>
          </>
        )}

        {gsc && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Google: clicks e impresiones</SectionTitle>
              <VisitorsChart
                data={gsc.serie.map((p) => ({ fecha: p.fecha, a: p.clicks, b: p.impresiones }))}
                labelA="Clicks"
                labelB="Impresiones"
                ejeSecundario
              />
            </Card>
            <Card>
              <SectionTitle>Busquedas que traen visitas</SectionTitle>
              <TablaConsultas consultas={gsc.consultas} />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

// --- Bloques de presentacion (server components) ---

function GuiaConexion() {
  return (
    <Card>
      <SectionTitle>Conectar la analitica web</SectionTitle>
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>
          Esta pestana se alimenta de Google Analytics 4 (visitantes, paginas, funnel) y de
          Google Search Console (visibilidad en Google). Falta conectar las credenciales:
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-muted">
          <li>
            Comprueba que la web de reservas tiene GA4 instalado: abre el codigo fuente y busca
            &quot;gtag&quot; o &quot;G-&quot;. Si no lo tiene, crea una propiedad en
            analytics.google.com e instala la etiqueta (o activa la integracion de Google
            Analytics en el editor de tu web).
          </li>
          <li>
            En console.cloud.google.com crea una service account, genera una clave JSON y activa
            las APIs &quot;Google Analytics Data API&quot; y &quot;Search Console API&quot;.
          </li>
          <li>
            Anade el email de esa service account como lector en la propiedad de GA4 (Admin,
            Access Management) y en Search Console (Ajustes, Usuarios y permisos).
          </li>
          <li>
            En Vercel anade las variables: GOOGLE_SERVICE_ACCOUNT_EMAIL,
            GOOGLE_SERVICE_ACCOUNT_KEY (la private_key del JSON), GA4_PROPERTY_ID (numero de la
            propiedad) y GSC_SITE_URL (p. ej. sc-domain:tudominio.com).
          </li>
        </ol>
        <p className="text-xs text-faint">
          Con solo GA4 ya funcionan visitantes, paginas y funnel; Search Console anade la parte
          de busquedas en Google. Las reservas directas de Guesty se muestran igualmente.
        </p>
      </div>
    </Card>
  );
}

function TablaPaginas({ paginas, nombres }: { paginas: PaginaTop[]; nombres: string[] }) {
  if (paginas.length === 0) return <p className="text-sm text-faint">Sin datos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="px-2 py-2 text-left font-medium">Pagina</th>
            <th className="px-2 py-2 text-right font-medium">Vistas</th>
            <th className="px-2 py-2 text-right font-medium">Visitantes</th>
          </tr>
        </thead>
        <tbody>
          {paginas.map((p) => (
            <tr key={p.path} className="border-b border-line/60">
              <td className="max-w-[360px] truncate px-2 py-2 text-left" title={`${p.titulo} · ${p.path}`}>
                <span className="text-ink">{p.path}</span>
                {esPaginaApartamento(p.path, nombres) && (
                  <span className="ml-1.5 rounded bg-brand/10 px-1 py-0.5 text-[10px] font-medium text-brand">
                    apartamento
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right text-ink">{num(p.vistas)}</td>
              <td className="px-2 py-2 text-right text-muted">{num(p.visitantes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaDim({
  items,
  total,
  usarSesiones = false,
}: {
  items: DimValor[];
  total: number;
  usarSesiones?: boolean;
}) {
  if (items.length === 0) return <p className="text-sm text-faint">Sin datos.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => {
        const v = usarSesiones ? it.sesiones : it.visitantes;
        const cuota = total > 0 ? v / total : 0;
        return (
          <div key={it.nombre} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 truncate text-muted" title={it.nombre}>
              {it.nombre}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-surface-2">
              <div className="h-full rounded bg-brand/60" style={{ width: `${Math.round(cuota * 100)}%` }} />
            </div>
            <span className="tabular w-20 shrink-0 text-right text-ink">
              {num(v)} <span className="text-xs text-faint">({pct(cuota, 0)})</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TablaConsultas({ consultas }: { consultas: GscConsulta[] }) {
  if (consultas.length === 0) return <p className="text-sm text-faint">Sin datos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="px-2 py-2 text-left font-medium">Busqueda</th>
            <th className="px-2 py-2 text-right font-medium">Clicks</th>
            <th className="px-2 py-2 text-right font-medium">Impr.</th>
            <th className="px-2 py-2 text-right font-medium">Pos.</th>
          </tr>
        </thead>
        <tbody>
          {consultas.map((c) => (
            <tr key={c.consulta} className="border-b border-line/60">
              <td className="max-w-[200px] truncate px-2 py-2 text-left text-ink" title={c.consulta}>
                {c.consulta}
              </td>
              <td className="px-2 py-2 text-right text-ink">{num(c.clicks)}</td>
              <td className="px-2 py-2 text-right text-muted">{num(c.impresiones)}</td>
              <td className="px-2 py-2 text-right text-muted">{c.posicion.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
