import { requireSesion } from "@/lib/session";
import { ChevronDown, Megaphone } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import InsightItem from "@/components/InsightItem";
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

const AREA_LABEL: Record<Hallazgo["area"], string> = {
  fotos: "Fotos",
  titulo: "Título",
  descripcion: "Descripción",
  amenities: "Amenities",
  terminos: "Términos",
  reviews: "Reviews",
  tarifas: "Tarifas",
};

function colorPuntuacion(p: number): string {
  if (p >= 75) return "bg-ok-soft text-ok";
  if (p >= 50) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}
function colorBarra(p: number): string {
  if (p >= 75) return "bg-ok";
  if (p >= 50) return "bg-warn";
  return "bg-bad";
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
      <AppShell titulo="Anuncios" estado={estado} mes={mes}>
        <SetupNotice titulo="Todavía no hay unidades sincronizadas" />
      </AppShell>
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
    <AppShell
      titulo="Anuncios"
      subtitulo="Auditoría de conversión: qué cambiar en cada anuncio para vender más sin tocar el precio"
      estado={estado}
      mes={mes}
    >
      {sinDatos && (
        <Card>
          <EmptyState icono={<Megaphone size={18} aria-hidden />} titulo="Falta el contenido de los anuncios">
            La base de datos aún no tiene fotos, descripción, amenities ni términos de los anuncios.
            Pulsa <b>Actualizar datos</b> (o espera al siguiente sync automático): la sincronización
            ya pide esos campos a Guesty y esta página se rellenará sola.
          </EmptyState>
        </Card>
      )}

      {conDatos.length > 0 && (
        <Card>
          <CardHeader
            titulo="Ranking de anuncios"
            descripcion="Puntuación de conversión sobre 100, peor primero"
            accion={
              media !== null ? (
                <span className="text-sm text-muted">
                  Media <span className="tabular font-semibold text-ink">{Math.round(media)}</span> ·{" "}
                  <span className="tabular font-semibold text-bad">{num(alertasTotales)}</span> alertas
                </span>
              ) : undefined
            }
          />
          <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
            {conDatos.map(({ u, a }) => (
              <li key={u.listingId}>
                <a href={`#a-${u.listingId}`} className="group flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm font-medium text-ink group-hover:text-brand">
                    {u.displayName}
                  </span>
                  <span className="h-2 flex-1 rounded-full bg-surface-3" aria-hidden>
                    <span
                      className={`block h-full rounded-full ${colorBarra(a.puntuacion)}`}
                      style={{ width: `${a.puntuacion}%` }}
                    />
                  </span>
                  <span className="tabular w-8 shrink-0 text-right text-sm font-semibold text-ink">
                    {a.puntuacion}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {conDatos.map(({ u, a }) => {
        const nAlertas = a.hallazgos.filter((h) => h.tono === "alerta").length;
        const nMejoras = a.hallazgos.length - nAlertas;
        return (
          <details
            key={u.listingId}
            id={`a-${u.listingId}`}
            open={a.puntuacion < 60}
            className="group scroll-mt-20 rounded-xl border border-line bg-surface shadow-card"
          >
            <summary className="flex cursor-pointer items-center gap-3 p-4 sm:p-5">
              <span
                className={`tabular flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold ${colorPuntuacion(a.puntuacion)}`}
              >
                {a.puntuacion}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{u.displayName}</span>
                <span className="block truncate text-sm text-muted">
                  {a.titulo ? `"${a.titulo}"` : "Sin título"}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-xs sm:block">
                {nAlertas > 0 && <span className="block font-semibold text-bad">{nAlertas} alertas</span>}
                {nMejoras > 0 && <span className="block text-muted">{nMejoras} mejoras</span>}
              </span>
              <ChevronDown size={18} className="shrink-0 text-faint transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-line px-4 pt-4 pb-4 sm:px-5 sm:pb-5">
              <Hechos a={a} />
              {a.hallazgos.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Anuncio en orden: nada que corregir.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {a.hallazgos.map((h, i) => (
                    <InsightItem key={i} tono={h.tono} texto={h.texto} etiqueta={AREA_LABEL[h.area]} />
                  ))}
                </div>
              )}
              <p className="mt-3">
                <a
                  href={`/unidad/${u.listingId}?mes=${mes}`}
                  className="text-sm font-medium text-brand hover:text-brand-ink"
                >
                  Ver la unidad
                </a>
              </p>
            </div>
          </details>
        );
      })}

      {!sinDatos && auditorias.some((x) => !x.a.datos) && (
        <p className="text-xs text-faint">
          Sin contenido en Guesty: {auditorias.filter((x) => !x.a.datos).map((x) => x.u.displayName).join(", ")}.
        </p>
      )}

      <p className="text-xs text-faint">
        Puntuación sobre 100: fotos (20), título (10), descripción (15), amenities clave (25),
        términos (10), reviews (10) y tarifas (10). Los datos salen del anuncio tal como está en
        Guesty; cámbialos allí y se reflejan en el siguiente sync.
      </p>
    </AppShell>
  );
}

function Hechos({ a }: { a: AuditoriaAnuncio }) {
  const items: { label: string; value: string }[] = [
    { label: "Fotos", value: num(a.fotos) },
    { label: "Descripción", value: `${num(a.descripcionLen)} caracteres` },
    { label: "Amenities clave", value: `${a.amenities}/${a.amenities + a.faltanAmenities.length}` },
    { label: "Estancia mínima", value: a.minNoches !== null ? `${num(a.minNoches)} noches` : "-" },
    { label: "Cancelación", value: a.cancelacion ?? "-" },
    { label: "Tarifa limpieza", value: a.tarifaLimpieza !== null ? eur(a.tarifaLimpieza) : "-" },
    {
      label: "Coste limpieza por estancia",
      value: a.costeLimpiezaEstancia !== null ? eur(a.costeLimpiezaEstancia) : "-",
    },
    {
      label: "Descuento semanal / mensual",
      value: `${a.descuentoSemanal !== null ? pct(a.descuentoSemanal, 0) : "-"} / ${a.descuentoMensual !== null ? pct(a.descuentoMensual, 0) : "-"}`,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-surface-2 px-3 py-2">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="tabular mt-0.5 truncate text-sm font-semibold text-ink" title={it.value}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
