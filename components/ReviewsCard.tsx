import { ArrowRight, ChevronDown, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ResumenReviews } from "@/lib/metrics";
import type { ReviewCompleta } from "@/lib/review-analysis";
import type { InsightsReviews } from "@/lib/review-insights";
import Estrellas from "@/components/reviews/Estrellas";
import ReviewItem from "@/components/reviews/ReviewItem";
import { num, pct } from "@/lib/format";

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
  temas,
  hrefTodas,
  mostrarUnidad = true,
}: {
  resumen: ResumenReviews;
  no5: ReviewCompleta[];
  /** Temas de los ultimos 12 meses (lo que valoran y de lo que se quejan). */
  temas?: InsightsReviews | null;
  hrefTodas?: string;
  mostrarUnidad?: boolean;
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

      {temas && temas.analizadas > 0 && (temas.elogios.length > 0 || temas.quejas.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line px-3.5 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <ThumbsUp size={13} className="text-ok" aria-hidden />
              Lo que más valoran (12 meses)
            </div>
            <p className="text-sm text-ink">
              {temas.elogios.length
                ? temas.elogios.slice(0, 4).map((t) => `${t.label} (${t.positivas})`).join(" · ")
                : "Sin elogios concretos."}
            </p>
          </div>
          <div className="rounded-lg border border-line px-3.5 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <ThumbsDown size={13} className="text-bad" aria-hidden />
              Quejas que se repiten (12 meses)
            </div>
            <p className="text-sm text-ink">
              {temas.quejas.length
                ? temas.quejas.slice(0, 4).map((t) => `${t.label} (${t.negativas})`).join(" · ")
                : "Ninguna queja repetida."}
            </p>
          </div>
        </div>
      )}

      <details className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2">
          <span>Reviews por debajo de 5 estrellas ({no5.length})</span>
          <ChevronDown size={16} className="shrink-0 text-faint transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="divide-y divide-line border-t border-line px-3.5">
          {no5.length === 0 ? (
            <p className="py-3 text-sm text-muted">No hay reviews por debajo de 5 estrellas.</p>
          ) : (
            no5.map((r) => <ReviewItem key={r.id} r={r} mostrarUnidad={mostrarUnidad} />)
          )}
        </div>
      </details>

      {hrefTodas && (
        <a
          href={hrefTodas}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-brand transition hover:text-brand-ink"
        >
          Ver todas las reviews y el análisis
          <ArrowRight size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}
