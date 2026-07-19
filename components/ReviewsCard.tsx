import type { ResumenReviews, ReviewNo5 } from "@/lib/metrics";
import { num, pct, fecha } from "@/lib/format";
import { CANAL_LABEL, normalizarCanal } from "@/lib/config";

function Estrellas({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-faint">sin nota</span>;
  const llenas = Math.round(rating);
  return (
    <span className="text-warn" title={`${rating.toFixed(2)} / 5`}>
      {"★".repeat(llenas)}
      <span className="text-line">{"★".repeat(5 - llenas)}</span>
    </span>
  );
}

export default function ReviewsCard({
  resumen,
  no5,
}: {
  resumen: ResumenReviews;
  no5: ReviewNo5[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            Rating medio
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular text-2xl font-semibold text-ink">
              {resumen.ratingMedio !== null ? resumen.ratingMedio.toFixed(2) : "-"}
            </span>
            <Estrellas rating={resumen.ratingMedio} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            Numero de reviews
          </div>
          <div className="tabular mt-1 text-2xl font-semibold text-ink">
            {num(resumen.total)}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            Estancias con review
          </div>
          <div className="tabular mt-1 text-2xl font-semibold text-ink">
            {pct(resumen.pctConReview)}
          </div>
          <div className="text-xs text-faint">
            {num(resumen.total)} de {num(resumen.estancias)} estancias
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">
            5 estrellas
          </div>
          <div className="tabular mt-1 text-2xl font-semibold text-ink">
            {resumen.conRating > 0 ? pct(resumen.cinco / resumen.conRating) : "-"}
          </div>
          <div className="text-xs text-faint">{num(resumen.cinco)} reviews</div>
        </div>
      </div>

      <details className="rounded-lg border border-line">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">
          Reviews por debajo de 5 estrellas ({no5.length})
        </summary>
        <div className="divide-y divide-line/60">
          {no5.length === 0 ? (
            <p className="px-3 py-3 text-sm text-faint">
              No hay reviews por debajo de 5 estrellas.
            </p>
          ) : (
            no5.map((r) => (
              <div key={r.id} className="px-3 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <Estrellas rating={r.rating} />
                  <span className="tabular text-muted">
                    {r.rating !== null ? r.rating.toFixed(1) : "-"}
                    {r.ratingScale === 10 && r.ratingRaw !== null
                      ? ` (${r.ratingRaw}/10)`
                      : ""}
                  </span>
                  <span className="text-faint">·</span>
                  <span className="text-muted">
                    {CANAL_LABEL[normalizarCanal(r.channel)]}
                  </span>
                  <span className="text-faint">·</span>
                  <span className="text-faint">{fecha(r.fecha)}</span>
                  {r.guest && (
                    <>
                      <span className="text-faint">·</span>
                      <span className="text-muted">{r.guest}</span>
                    </>
                  )}
                </div>
                {r.content && <p className="text-sm text-ink">{r.content}</p>}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
