import { ChevronDown, Languages, Lock } from "lucide-react";
import Estrellas from "@/components/reviews/Estrellas";
import type { ReviewCompleta } from "@/lib/review-analysis";
import { TEMA_LABEL } from "@/lib/review-temas";
import { CANAL_LABEL, normalizarCanal } from "@/lib/config";
import { fecha } from "@/lib/format";

// Una review: traducida al castellano de Espana si viene en otro idioma (con
// el original desplegable), comentario privado, y los temas detectados.

const IDIOMA: Record<string, string> = {
  en: "inglés",
  fr: "francés",
  de: "alemán",
  it: "italiano",
  pt: "portugués",
  nl: "neerlandés",
  ca: "catalán",
  eu: "euskera",
  gl: "gallego",
  sv: "sueco",
  da: "danés",
  no: "noruego",
  nb: "noruego",
  fi: "finés",
  pl: "polaco",
  cs: "checo",
  ru: "ruso",
  uk: "ucraniano",
  ro: "rumano",
  hu: "húngaro",
  el: "griego",
  tr: "turco",
  ar: "árabe",
  he: "hebreo",
  zh: "chino",
  ja: "japonés",
  ko: "coreano",
};

const coma = (n: number, d: number) => n.toFixed(d).replace(".", ",");

function Bloque({ etiqueta, texto, icono }: { etiqueta?: string; texto: string; icono?: React.ReactNode }) {
  return (
    <div className={etiqueta ? "rounded-lg bg-surface-2 px-3 py-2" : ""}>
      {etiqueta && (
        <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-muted">
          {icono}
          {etiqueta}
        </div>
      )}
      <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{texto}</p>
    </div>
  );
}

export default function ReviewItem({ r, mostrarUnidad = true }: { r: ReviewCompleta; mostrarUnidad?: boolean }) {
  const a = r.analisis;
  const t = r.textos;
  const traducida = !!a && a.idioma !== "es" && !!(a.publicaEs || a.privadaEs || a.positivoEs || a.negativoEs);
  const publica = (traducida && a?.publicaEs) || t.publica;
  const privada = (traducida && a?.privadaEs) || t.privada;
  const positivo = (traducida && a?.positivoEs) || t.positivo;
  const negativo = (traducida && a?.negativoEs) || t.negativo;
  const temas = a?.temas ?? [];
  const negativos = temas.filter((x) => x.sentimiento === "negativo");
  const positivos = temas.filter((x) => x.sentimiento === "positivo");

  return (
    <article className="flex flex-col gap-2 py-3.5">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {mostrarUnidad && r.unidad && (
          <span className="rounded-md bg-surface-3 px-1.5 py-px text-xs font-semibold text-muted">{r.unidad}</span>
        )}
        <Estrellas rating={r.rating} />
        <span className="tabular text-muted">
          {r.rating !== null ? coma(r.rating, 1) : "-"}
          {r.ratingEscala === 10 && r.ratingRaw !== null ? ` (${coma(r.ratingRaw, 1)}/10)` : ""}
        </span>
        <span className="text-faint">·</span>
        <span className="text-muted">{CANAL_LABEL[normalizarCanal(r.canal)]}</span>
        <span className="text-faint">·</span>
        <span className="text-faint">{fecha(r.fecha)}</span>
        {r.huesped && (
          <>
            <span className="text-faint">·</span>
            <span className="text-muted">{r.huesped}</span>
          </>
        )}
        {traducida && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-1.5 py-px text-xs font-medium text-brand-ink">
            <Languages size={12} aria-hidden />
            {IDIOMA[a!.idioma ?? ""] ? `Traducida del ${IDIOMA[a!.idioma!]}` : "Traducida"}
          </span>
        )}
      </header>

      {publica && <Bloque texto={publica} />}
      {positivo && <Bloque etiqueta="Le gustó" texto={positivo} />}
      {negativo && <Bloque etiqueta="No le gustó" texto={negativo} />}
      {privada && (
        <Bloque etiqueta="Privado al anfitrión" texto={privada} icono={<Lock size={11} aria-hidden />} />
      )}

      {temas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Temas">
          {negativos.map((x, i) => (
            <li key={`n${i}`} className="rounded-md bg-bad-soft px-1.5 py-0.5 text-xs text-bad">
              <span className="font-semibold">{TEMA_LABEL[x.tema]}</span>
              {x.detalle ? `: ${x.detalle}` : ""}
            </li>
          ))}
          {positivos.map((x, i) => (
            <li key={`p${i}`} className="rounded-md bg-ok-soft px-1.5 py-0.5 text-xs font-medium text-ok" title={x.detalle}>
              {TEMA_LABEL[x.tema]}
            </li>
          ))}
        </ul>
      )}

      {traducida && (
        <details className="group/original">
          <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted hover:text-ink">
            Ver original
            <ChevronDown size={13} className="transition group-open/original:rotate-180" aria-hidden />
          </summary>
          <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-line pl-3 text-sm text-muted">
            {t.publica && <p className="whitespace-pre-line">{t.publica}</p>}
            {t.positivo && <p className="whitespace-pre-line">+ {t.positivo}</p>}
            {t.negativo && <p className="whitespace-pre-line">− {t.negativo}</p>}
            {t.privada && <p className="whitespace-pre-line italic">{t.privada}</p>}
          </div>
        </details>
      )}
    </article>
  );
}
