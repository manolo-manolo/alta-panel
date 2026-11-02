import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { Card, CardHeader, KpiCard, EmptyState, pillClass } from "@/components/ui";
import InsightItem from "@/components/InsightItem";
import ReviewItem from "@/components/reviews/ReviewItem";
import TraducirPendientes from "@/components/reviews/TraducirPendientes";
import { KeyRound, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";
import { reviewsCompletas, estadoTraduccion, type ReviewCompleta } from "@/lib/review-analysis";
import { insightsReviews, textoArreglo, type MencionTema } from "@/lib/review-insights";
import { getUnidades, estadoDatos, mesPorDefecto } from "@/lib/metrics";
import { hoyMadrid, sumarDias } from "@/lib/time";
import { num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews" };

const VENTANAS = [
  { v: "90", l: "90 días", texto: "en los últimos 90 días", dias: 90 },
  { v: "365", l: "12 meses", texto: "en los últimos 12 meses", dias: 365 },
  { v: "todo", l: "Todo", texto: "en todo el histórico", dias: null },
] as const;

const FILTROS = [
  { v: "todas", l: "Todas" },
  { v: "quejas", l: "Con quejas" },
  { v: "no5", l: "Menos de 5 estrellas" },
] as const;

const coma = (n: number, d: number) => n.toFixed(d).replace(".", ",");

function ListaTemas({
  temas,
  tono,
  base,
  mostrarUnidad,
}: {
  temas: MencionTema[];
  tono: "bueno" | "malo";
  base: number;
  mostrarUnidad: boolean;
}) {
  if (temas.length === 0) {
    return <p className="text-sm text-muted">{tono === "bueno" ? "Sin elogios concretos todavía." : "Sin quejas repetidas."}</p>;
  }
  const max = Math.max(...temas.map((t) => (tono === "bueno" ? t.positivas : t.negativas)));
  return (
    <ul className="flex flex-col gap-3.5">
      {temas.map((t) => {
        const n = tono === "bueno" ? t.positivas : t.negativas;
        const citas = tono === "bueno" ? t.citasPos : t.citasNeg;
        return (
          <li key={t.tema}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <span className="tabular text-xs text-muted">
                {num(n)} {n === 1 ? "reseña" : "reseñas"}
                {base > 0 ? ` · ${pct(n / base, 0)}` : ""}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden>
              <div
                className={`h-full rounded-full ${tono === "bueno" ? "bg-ok" : "bg-bad"}`}
                style={{ width: `${(n / max) * 100}%` }}
              />
            </div>
            {citas.length > 0 && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {citas.slice(0, 2).map((c, i) => (
                  <span key={c.reviewId + i}>
                    {i > 0 && " · "}«{c.texto}»
                    {mostrarUnidad && <span className="text-faint"> ({c.unidad})</span>}
                  </span>
                ))}
              </p>
            )}
            {mostrarUnidad && tono === "malo" && t.unidadesNeg.length > 1 && (
              <p className="mt-1 text-xs text-faint">
                En {t.unidadesNeg.map((u) => `${u.nombre} (${u.n})`).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ ventana?: string; unidad?: string; filtro?: string; n?: string }>;
}) {
  await requireSesion();
  const sp = await searchParams;
  const ventana = VENTANAS.find((v) => v.v === sp.ventana) ?? VENTANAS[1];
  const filtro = FILTROS.find((f) => f.v === sp.filtro) ?? FILTROS[0];
  const limite = Math.min(500, Math.max(20, Number(sp.n) || 30));
  const mes = mesPorDefecto();

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
    return (
      <AppShell titulo="Reviews" estado={estado} mes={mes}>
        <SetupNotice titulo="Base de datos no disponible" detalle={e instanceof Error ? e.message : String(e)} />
      </AppShell>
    );
  }
  const sel = sp.unidad ? unidades.find((u) => u.listingId === sp.unidad) : undefined;
  const hoy = hoyMadrid();
  const desde = ventana.dias !== null ? sumarDias(hoy, -ventana.dias) : undefined;

  const [enVentana, todas] = await Promise.all([
    reviewsCompletas(desde, sel?.listingId),
    reviewsCompletas(undefined, sel?.listingId),
  ]);
  const nombres = new Map(unidades.map((u) => [u.listingId, u.displayName]));
  const ins = insightsReviews(enVentana, nombres, hoy);
  const trad = estadoTraduccion(todas);

  const href = (p: { ventana?: string; unidad?: string | null; filtro?: string; n?: number }) => {
    const q = new URLSearchParams();
    q.set("ventana", p.ventana ?? ventana.v);
    const u = p.unidad === undefined ? sel?.listingId : p.unidad;
    if (u) q.set("unidad", u);
    const f = p.filtro ?? filtro.v;
    if (f !== "todas") q.set("filtro", f);
    if (p.n) q.set("n", String(p.n));
    return `/reviews?${q.toString()}`;
  };

  const lista: ReviewCompleta[] = enVentana.filter((r) => {
    if (filtro.v === "quejas") return (r.analisis?.temas ?? []).some((t) => t.sentimiento === "negativo");
    if (filtro.v === "no5") return r.rating !== null && r.rating < 4.995;
    return true;
  });
  const arreglos = ins.arreglos.slice(0, 8);

  return (
    <AppShell
      titulo="Reviews"
      subtitulo={`Lo que dicen los huéspedes ${ventana.texto} · ${sel ? sel.displayName : "todo el portfolio"}`}
      estado={estado}
      mes={mes}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {VENTANAS.map((v) => (
            <a key={v.v} href={href({ ventana: v.v })} className={pillClass(v.v === ventana.v)}>
              {v.l}
            </a>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <a href={href({ unidad: null })} className={pillClass(!sel)}>
            Portfolio
          </a>
          {unidades
            .filter((u) => u.activo)
            .map((u) => (
              <a key={u.listingId} href={href({ unidad: u.listingId })} className={pillClass(sel?.listingId === u.listingId)}>
                {u.displayName}
              </a>
            ))}
        </div>
      </div>

      {!trad.configurado ? (
        <Card>
          <EmptyState icono={<KeyRound size={20} aria-hidden />} titulo="Activa la traducción y el análisis">
            Añade la variable <code className="rounded bg-surface-3 px-1 py-px text-xs">ANTHROPIC_API_KEY</code> en
            Vercel (Settings, Environment Variables) con una clave de console.anthropic.com y vuelve a
            desplegar. Cada review se traduce al castellano de España y se analiza una sola vez (del orden
            de 1 céntimo por review). Mientras tanto, las reviews se muestran en su idioma original.
          </EmptyState>
        </Card>
      ) : trad.pendientes > 0 || trad.fallidas > 0 ? (
        <Card>
          <CardHeader
            titulo="Traducción y análisis"
            descripcion={`${num(trad.analizadas)} de ${num(trad.conTexto)} reviews con texto ya traducidas y analizadas. Las nuevas se traducen solas cada noche y al actualizar datos.`}
          />
          {trad.pendientes > 0 && <TraducirPendientes pendientes={trad.pendientes} />}
          {trad.fallidas > 0 && (
            <p className="mt-2 text-xs text-faint">
              {num(trad.fallidas)} {trad.fallidas === 1 ? "review no se pudo analizar" : "reviews no se pudieron analizar"}{" "}
              tras 3 intentos: se muestran en su idioma original.
            </p>
          )}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Rating medio"
          value={ins.rating !== null ? coma(ins.rating, 2) : "-"}
          sub={`${num(ins.n)} reviews ${ventana.texto}`}
        />
        <KpiCard label="5 estrellas" value={pct(ins.pct5)} sub="De las reviews con nota" />
        <KpiCard
          label="Con alguna queja"
          value={ins.analizadas > 0 ? pct(ins.conQueja / ins.analizadas) : "-"}
          sub={ins.analizadas > 0 ? `${num(ins.conQueja)} de ${num(ins.analizadas)} analizadas` : "Pendiente de análisis"}
        />
        <KpiCard
          label="Categoría más floja"
          value={ins.categorias[0] ? coma(ins.categorias[0].nota, 2) : "-"}
          sub={ins.categorias[0] ? `${ins.categorias[0].label} (notas de Airbnb y Booking)` : "Sin notas por categoría"}
        />
      </div>

      {ins.analizadas > 0 && (
        <Card>
          <CardHeader
            titulo="Lo que dicen los huéspedes"
            descripcion={`Temas mencionados en ${num(ins.analizadas)} reviews analizadas, con sus propias palabras`}
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ThumbsUp size={15} className="text-ok" aria-hidden />
                Lo que más valoran
              </h3>
              <ListaTemas temas={ins.elogios} tono="bueno" base={ins.analizadas} mostrarUnidad={!sel} />
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ThumbsDown size={15} className="text-bad" aria-hidden />
                Lo que más se repite como queja
              </h3>
              <ListaTemas temas={ins.quejas} tono="malo" base={ins.analizadas} mostrarUnidad={!sel} />
            </div>
          </div>
        </Card>
      )}

      {ins.analizadas > 0 && (
        <Card>
          <CardHeader
            titulo="Qué arreglar primero"
            descripcion="Quejas por unidad, primero las que se repiten y las recientes, con la mejora propuesta"
          />
          {arreglos.length === 0 ? (
            <p className="text-sm text-muted">Ninguna queja concreta {ventana.texto}.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {arreglos.map((a) => (
                <InsightItem
                  key={`${a.listingId}|${a.tema}`}
                  tono={a.n >= 2 ? "alerta" : "info"}
                  etiqueta={a.unidad}
                  texto={textoArreglo(a, ventana.texto)}
                  href={href({ unidad: a.listingId, filtro: "quejas" })}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {!sel && ins.porUnidad.length > 0 && (
        <Card>
          <CardHeader titulo="Por unidad" descripcion="Primero las de rating más bajo" />
          <div className="scroll-x">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th className="col-fija px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">Rating</th>
                  <th className="px-3 py-2 text-right">Reviews</th>
                  <th className="px-3 py-2 text-right">5 estrellas</th>
                  <th className="px-3 py-2 text-left">Lo que más gusta</th>
                  <th className="px-3 py-2 text-left">Queja principal</th>
                  <th className="px-3 py-2 text-left">Categoría más floja</th>
                </tr>
              </thead>
              <tbody>
                {ins.porUnidad.map((u) => (
                  <tr key={u.listingId}>
                    <td className="col-fija px-3 py-2 text-left font-medium whitespace-nowrap">
                      <a href={href({ unidad: u.listingId })} className="transition hover:text-brand">
                        {u.nombre}
                      </a>
                    </td>
                    <td className={`tabular px-3 py-2 text-right ${u.rating !== null && u.rating < 4.7 ? "font-semibold text-bad" : ""}`}>
                      {u.rating !== null ? coma(u.rating, 2) : "-"}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-muted">{num(u.n)}</td>
                    <td className="tabular px-3 py-2 text-right text-muted">{pct(u.pct5, 0)}</td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {u.elogio ? `${u.elogio.label} (${u.elogio.n})` : <span className="text-faint">-</span>}
                    </td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {u.queja ? (
                        <span className="text-bad">
                          {u.queja.label} ({u.queja.n})
                        </span>
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {u.categoriaFloja ? (
                        `${u.categoriaFloja.label} ${coma(u.categoriaFloja.nota, 2)}`
                      ) : (
                        <span className="text-faint">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {ins.categorias.length > 0 && (
        <Card>
          <CardHeader
            titulo="Notas por categoría"
            descripcion="Media de las notas que dan los huéspedes en Airbnb y Booking, de menor a mayor"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ins.categorias.map((c) => (
              <div key={c.categoria} className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
                <div className="text-xs font-medium text-muted">{c.label}</div>
                <div
                  className={`tabular mt-1 text-xl font-semibold tracking-tight ${
                    c.nota < 4.7 ? "text-bad" : c.nota < 4.85 ? "text-warn" : "text-ink"
                  }`}
                >
                  {coma(c.nota, 2)}
                </div>
                <div className="text-xs text-faint">{num(c.n)} notas</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          titulo="Reviews"
          descripcion={`${num(lista.length)} ${lista.length === 1 ? "review" : "reviews"} ${ventana.texto}, de la más reciente a la más antigua`}
        />
        <div className="mb-1 flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <a key={f.v} href={href({ filtro: f.v })} className={pillClass(f.v === filtro.v)}>
              {f.l}
            </a>
          ))}
        </div>
        {lista.length === 0 ? (
          <EmptyState icono={<MessageSquareText size={20} aria-hidden />} titulo="Sin reviews con este filtro" />
        ) : (
          <div className="divide-y divide-line">
            {lista.slice(0, limite).map((r) => (
              <ReviewItem key={r.id} r={r} mostrarUnidad={!sel} />
            ))}
          </div>
        )}
        {lista.length > limite && (
          <a
            href={href({ n: limite + 30 })}
            className="mt-2 inline-flex text-sm font-medium text-brand transition hover:text-brand-ink"
          >
            Ver 30 más ({num(lista.length - limite)} restantes)
          </a>
        )}
      </Card>
    </AppShell>
  );
}
