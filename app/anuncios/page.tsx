import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import SetupNotice from "@/components/SetupNotice";
import { Card, SectionTitle } from "@/components/ui";
import { auditarAnuncio, type AuditoriaAnuncio, type Hallazgo } from "@/lib/listing-audit";
import { contenidoListings, reviewsHistoricasPorUnidad, estanciasPorUnidad } from "@/lib/listings";
import { costesUnidadCategoriaMes } from "@/lib/costs";
import { eur, num, pct } from "@/lib/format";
import {
  getUnidades,
  unidadMesMap,
  sumar,
  adrDe,
  estadoDatos,
  ttm,
  mesPorDefecto,
  type UnidadMes,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Auditoria de conversion de los anuncios: que cambiar en Guesty/Airbnb para
// que cada piso venda mas sin tocar el precio.

const ESTILO: Record<Hallazgo["tono"], string> = {
  alerta: "border-l-bad bg-bad-soft/40",
  bueno: "border-l-ok bg-ok-soft/40",
  info: "border-l-brand bg-surface-2",
};
const ICONO: Record<Hallazgo["tono"], string> = { alerta: "▲", bueno: "●", info: "◆" };
const ICONO_COLOR: Record<Hallazgo["tono"], string> = {
  alerta: "text-bad",
  bueno: "text-ok",
  info: "text-brand",
};
const AREA_LABEL: Record<Hallazgo["area"], string> = {
  fotos: "Fotos",
  titulo: "Titulo",
  descripcion: "Descripcion",
  amenities: "Amenities",
  terminos: "Terminos",
  reviews: "Reviews",
  tarifas: "Tarifas",
};

function colorPuntuacion(p: number): string {
  if (p >= 75) return "bg-ok-soft text-ok";
  if (p >= 50) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}

export default async function AnunciosPage() {
  await requireSesion();
  const mes = mesPorDefecto();
  const mesesTTM = ttm(mes);

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const unidades = await getUnidades();
  if (unidades.length === 0) {
    return (
      <Shell mes={mes} unidades={[]} ultima={estado.ultimoExito}>
        <Banner estado={estado} />
        <SetupNotice titulo="Todavia no hay unidades sincronizadas" />
      </Shell>
    );
  }

  const [contenido, reviews, estancias, map, celdas] = await Promise.all([
    contenidoListings(),
    reviewsHistoricasPorUnidad(),
    estanciasPorUnidad(`${mesesTTM[0]}-01`),
    unidadMesMap(unidades, mesesTTM),
    costesUnidadCategoriaMes(mesesTTM),
  ]);
  const limpiezaCoste = new Map<string, number>();
  for (const c of celdas) {
    if (c.categoria !== "limpieza_extra") continue;
    limpiezaCoste.set(c.unidad, (limpiezaCoste.get(c.unidad) ?? 0) + c.importe);
  }

  const auditorias = unidades
    .filter((u) => u.activo)
    .map((u) => {
      const items = mesesTTM
        .map((m) => map.get(`${u.listingId}|${m}`))
        .filter((x): x is UnidadMes => !!x);
      const r = sumar(items);
      const rev = reviews.get(u.listingId);
      const a = auditarAnuncio({
        raw: contenido.get(u.listingId) ?? null,
        adrTTM: adrDe(r),
        reviewsTotal: rev?.total ?? 0,
        ratingMedio: rev?.media ?? null,
        estanciasTTM: estancias.get(u.listingId) ?? 0,
        limpiezaCosteTTM: limpiezaCoste.get(u.nickname) ?? 0,
      });
      return { u, a };
    })
    .sort((x, y) => x.a.puntuacion - y.a.puntuacion);

  const sinDatos = auditorias.every((x) => !x.a.datos);
  const conDatos = auditorias.filter((x) => x.a.datos);
  const media =
    conDatos.length > 0
      ? conDatos.reduce((s, x) => s + x.a.puntuacion, 0) / conDatos.length
      : null;
  const alertasTotales = conDatos.reduce(
    (s, x) => s + x.a.hallazgos.filter((h) => h.tono === "alerta").length,
    0,
  );

  return (
    <Shell mes={mes} unidades={unidades} ultima={estado.ultimoExito}>
      <Banner estado={estado} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold text-ink">
          Anuncios <span className="text-muted">· auditoria de conversion</span>
        </h1>
        {media !== null && (
          <p className="text-sm text-muted">
            Puntuacion media <span className="font-semibold text-ink">{Math.round(media)}/100</span> ·{" "}
            <span className="font-semibold text-bad">{num(alertasTotales)}</span> alertas
          </p>
        )}
      </div>

      {sinDatos && (
        <Card>
          <SectionTitle>Falta el contenido de los anuncios</SectionTitle>
          <p className="text-sm text-muted">
            La base de datos aun no tiene fotos, descripcion, amenities ni terminos de los
            anuncios. Pulsa <b>Actualizar datos</b> en la barra superior (o espera al siguiente
            sync automatico): la sincronizacion ya pide esos campos a Guesty y esta pagina se
            rellenara sola.
          </p>
        </Card>
      )}

      {conDatos.map(({ u, a }) => (
        <Card key={u.listingId}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${colorPuntuacion(a.puntuacion)}`}>
                {a.puntuacion}
              </span>
              <a href={`/unidad/${u.listingId}?mes=${mes}`} className="text-base font-semibold text-ink hover:text-brand">
                {u.displayName}
              </a>
            </div>
            {a.titulo && (
              <span className="max-w-full truncate text-sm text-muted" title={a.titulo}>
                &quot;{a.titulo}&quot;
              </span>
            )}
          </div>
          <Hechos a={a} />
          {a.hallazgos.length === 0 ? (
            <p className="mt-2 text-sm text-faint">Anuncio en orden: nada que corregir.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {a.hallazgos.map((h, i) => (
                <div
                  key={i}
                  className={`flex gap-2 rounded-md border border-line border-l-4 px-3 py-2 text-sm ${ESTILO[h.tono]}`}
                >
                  <span className={`${ICONO_COLOR[h.tono]} shrink-0`}>{ICONO[h.tono]}</span>
                  <span className="min-w-0 flex-1 text-ink">
                    <span className="mr-1.5 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-muted">
                      {AREA_LABEL[h.area]}
                    </span>
                    {h.texto}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {!sinDatos && auditorias.some((x) => !x.a.datos) && (
        <p className="text-xs text-faint">
          Sin contenido en Guesty: {auditorias.filter((x) => !x.a.datos).map((x) => x.u.displayName).join(", ")}.
        </p>
      )}

      <p className="text-xs text-faint">
        Puntuacion sobre 100: fotos (20), titulo (10), descripcion (15), amenities clave (25),
        terminos (10), reviews (10) y tarifas (10). Los datos salen del anuncio tal como esta en
        Guesty; cambialos alli y se reflejan en el siguiente sync.
      </p>
    </Shell>
  );
}

function Hechos({ a }: { a: AuditoriaAnuncio }) {
  const items: { label: string; value: string }[] = [
    { label: "Fotos", value: num(a.fotos) },
    { label: "Descripcion", value: `${num(a.descripcionLen)} car.` },
    { label: "Amenities clave", value: `${a.amenities}/${a.amenities + a.faltanAmenities.length}` },
    { label: "Min. noches", value: a.minNoches !== null ? num(a.minNoches) : "-" },
    { label: "Cancelacion", value: a.cancelacion ?? "-" },
    { label: "Tarifa limpieza", value: a.tarifaLimpieza !== null ? eur(a.tarifaLimpieza) : "-" },
    {
      label: "Coste limpieza/estancia",
      value: a.costeLimpiezaEstancia !== null ? eur(a.costeLimpiezaEstancia) : "-",
    },
    {
      label: "Dto. semanal / mensual",
      value: `${a.descuentoSemanal !== null ? pct(a.descuentoSemanal, 0) : "-"} / ${a.descuentoMensual !== null ? pct(a.descuentoMensual, 0) : "-"}`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-2 border-b border-line/40 py-1">
          <span className="text-faint">{it.label}</span>
          <span className="tabular truncate text-ink" title={it.value}>{it.value}</span>
        </div>
      ))}
    </div>
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
        periodo="mes"
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={ultima}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">{children}</main>
    </div>
  );
}
