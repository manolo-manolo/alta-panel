import { ChevronRight, CircleAlert, Info, TrendingUp } from "lucide-react";
import type { Insight } from "@/lib/insights";
import { eur } from "@/lib/format";

// Consejo o accion: icono por tono (alerta, oportunidad, aviso), texto,
// etiqueta opcional (unidad o area), euros opcionales y enlace opcional.

const ICONO = {
  alerta: CircleAlert,
  bueno: TrendingUp,
  info: Info,
} as const;

const ICONO_ESTILO: Record<Insight["tono"], string> = {
  alerta: "bg-bad-soft text-bad",
  bueno: "bg-ok-soft text-ok",
  info: "bg-brand-soft text-brand",
};

const BORDE: Record<Insight["tono"], string> = {
  alerta: "border-bad/20",
  bueno: "border-ok/20",
  info: "border-line",
};

export default function InsightItem({
  tono,
  texto,
  etiqueta,
  impacto,
  href,
}: {
  tono: Insight["tono"];
  texto: string;
  etiqueta?: string;
  impacto?: number | null;
  href?: string;
}) {
  const Icono = ICONO[tono];
  const conImpacto = impacto !== undefined && impacto !== null && impacto >= 50;
  const contenido = (
    <>
      <span
        className={`mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ICONO_ESTILO[tono]}`}
      >
        <Icono size={15} strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {(etiqueta || conImpacto) && (
          <span className="mb-1 flex min-h-7 items-center justify-between gap-2">
            {etiqueta ? (
              <span className="truncate rounded-md bg-surface-3 px-1.5 py-px text-xs font-semibold text-muted">
                {etiqueta}
              </span>
            ) : (
              <span />
            )}
            {conImpacto && (
              <span
                className="tabular shrink-0 rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold text-ink"
                title="Impacto estimado"
              >
                {eur(impacto)}
              </span>
            )}
          </span>
        )}
        <span className="block text-sm leading-relaxed text-ink">{texto}</span>
      </span>
      {href && <ChevronRight size={16} className="shrink-0 self-center text-faint" aria-hidden />}
    </>
  );
  const base = `flex gap-3 rounded-lg border bg-surface p-3 ${BORDE[tono]}`;
  return href ? (
    <a href={href} className={`${base} transition hover:border-line-strong hover:bg-surface-2`}>
      {contenido}
    </a>
  ) : (
    <div className={base}>{contenido}</div>
  );
}
