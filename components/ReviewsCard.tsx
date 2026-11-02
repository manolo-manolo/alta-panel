import { ChevronDown, Star } from "lucide-react";
import type { ResumenReviews, ReviewNo5 } from "@/lib/metrics";
import { num, pct, fecha } from "@/lib/format";
import { CANAL_LABEL, normalizarCanal } from "@/lib/config";

function Estrellas({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-faint">sin nota</span>;
  const llenas = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-px" title={`${rating.toFixed(2)} / 5`} aria-label={`${rating.toFixed(1)} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          className={i < llenas ? "fill-warn text-warn" : "fill-line text-line"}
          aria-hidden
        />
      ))}
    </span>
  );
}

const coma = (n: number, d: number) => n.toFixed(d).replace(".", ",");

function Tile({ label, value, sub, extra }: { label: string; value: string; sub?: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="tabular text-xl font-semibold tracking-tight text-ink">{value}</span>
        {extra}
      </div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Rating medio"
          value={resumen.ratingMedio !== null ? coma(resumen.ratingMedio, 2) : "-"}
          extra={<Estrellas rating={resumen.ratingMedio} />}
        />
        <Tile label="Reviews" value={num(resumen.total)} />
        <Tile
          label="Estancias con review"
          value={pct(resumen.pctConReview)}
          sub={`${num(resumen.total)} de ${num(resumen.estancias)} estancias`}
        />
        <Tile
          label="5 estrellas"
          value={resumen.conRating > 0 ? pct(resumen.cinco / resumen.conRating) : "-"}
          sub={`${num(resumen.cinco)} reviews`}
        />
      </div>

      <details className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2">
          <span>Reviews por debajo de 5 estrellas ({no5.length})</span>
          <ChevronDown size={16} className="shrink-0 text-faint transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="divide-y divide-line border-t border-line">
          {no5.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-muted">No hay reviews por debajo de 5 estrellas.</p>
          ) : (
            no5.map((r) => (
              <div key={r.id} className="px-3.5 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {r.unidad && (
                    <span className="rounded-md bg-surface-3 px-1.5 py-px text-xs font-semibold text-muted">
                      {r.unidad}
                    </span>
                  )}
                  <Estrellas rating={r.rating} />
                  <span className="tabular text-muted">
                    {r.rating !== null ? coma(r.rating, 1) : "-"}
                    {r.ratingScale === 10 && r.ratingRaw !== null ? ` (${r.ratingRaw}/10)` : ""}
                  </span>
                  <span className="text-faint">·</span>
                  <span className="text-muted">{CANAL_LABEL[normalizarCanal(r.channel)]}</span>
                  <span className="text-faint">·</span>
                  <span className="text-faint">{fecha(r.fecha)}</span>
                  {r.guest && (
                    <>
                      <span className="text-faint">·</span>
                      <span className="text-muted">{r.guest}</span>
                    </>
                  )}
                </div>
                {r.content && <p className="text-sm leading-relaxed text-ink">{r.content}</p>}
              </div>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
