import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { pct } from "@/lib/format";
import type { Semaforo } from "@/lib/config";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-[15px] font-semibold tracking-tight text-ink">{children}</h2>
  );
}

/** Cabecera de tarjeta: titulo, descripcion opcional y accion a la derecha. */
export function CardHeader({
  titulo,
  descripcion,
  accion,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-sm text-muted">{descripcion}</p>}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}

/** Enlace de navegacion secundaria con flecha. */
export function LinkFlecha({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand transition hover:text-brand-ink"
    >
      {children}
      <ArrowRight size={14} aria-hidden />
    </a>
  );
}

/**
 * Insignia de variacion relativa. Por defecto subir es bueno (verde); con
 * `invertido` subir es malo (costes, bloqueos).
 */
export function DeltaBadge({
  fraccion,
  etiqueta,
  invertido = false,
  titulo,
}: {
  fraccion: number | null;
  etiqueta: string;
  invertido?: boolean;
  /** Explicacion al pasar el raton (que se compara exactamente). */
  titulo?: string;
}) {
  if (fraccion === null) {
    return (
      <span className="text-xs text-faint" title={titulo}>
        {etiqueta ? `${etiqueta}: sin dato` : "sin dato"}
      </span>
    );
  }
  const plano = Math.abs(fraccion) < 0.005;
  const sube = fraccion > 0;
  const bueno = invertido ? !sube : sube;
  const estilo = plano
    ? "bg-surface-3 text-muted"
    : bueno
      ? "bg-ok-soft text-ok"
      : "bg-bad-soft text-bad";
  const Icono = plano ? Minus : sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={titulo}>
      <span
        className={`tabular inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium ${estilo}`}
      >
        <Icono size={12} strokeWidth={2.5} aria-hidden />
        {pct(Math.abs(fraccion))}
      </span>
      {etiqueta && <span className="text-faint">{etiqueta}</span>}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  deltaMoM,
  deltaYoY,
  deltaLfl,
  sub,
  etiquetaMoM = "vs mes ant.",
  etiquetaYoY = "vs año ant.",
  tituloYoY,
  tituloLfl,
  invertido = false,
}: {
  label: string;
  value: string;
  deltaMoM?: number | null;
  deltaYoY?: number | null;
  /** Variacion interanual like-for-like (mismas unidades y meses). */
  deltaLfl?: number | null;
  sub?: string;
  etiquetaMoM?: string;
  etiquetaYoY?: string;
  tituloYoY?: string;
  tituloLfl?: string;
  invertido?: boolean;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className="tabular mt-1.5 text-[1.625rem] leading-tight font-semibold tracking-tight text-ink">
        {value}
      </span>
      {sub && <span className="mt-0.5 text-xs text-muted">{sub}</span>}
      {(deltaMoM !== undefined || deltaYoY !== undefined || deltaLfl !== undefined) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
          {deltaMoM !== undefined && (
            <DeltaBadge fraccion={deltaMoM ?? null} etiqueta={etiquetaMoM} invertido={invertido} />
          )}
          {deltaYoY !== undefined && (
            <DeltaBadge
              fraccion={deltaYoY ?? null}
              etiqueta={etiquetaYoY}
              invertido={invertido}
              titulo={tituloYoY}
            />
          )}
          {deltaLfl !== undefined && (
            <DeltaBadge
              fraccion={deltaLfl ?? null}
              etiqueta="mismas unidades"
              invertido={invertido}
              titulo={tituloLfl}
            />
          )}
        </div>
      )}
    </section>
  );
}

const DOT: Record<Semaforo, string> = {
  verde: "bg-ok",
  ambar: "bg-warn",
  rojo: "bg-bad",
};
const DOT_LABEL: Record<Semaforo, string> = {
  verde: "En objetivo",
  ambar: "Vigilar",
  rojo: "Por debajo de objetivo",
};

export function StatusDot({ estado }: { estado: Semaforo | null }) {
  if (!estado) return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-line-strong" />;
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[estado]}`}
      title={DOT_LABEL[estado]}
      aria-label={DOT_LABEL[estado]}
    />
  );
}

export function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tabular mt-1 text-lg font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-faint">{sub}</div>}
    </div>
  );
}

/** Rejilla de metricas compactas dentro de una tarjeta, separadas por lineas. */
export function StatGrid({
  items,
  className = "",
}: {
  items: { label: string; value: string; sub?: string }[];
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:grid-cols-3 ${className}`}
    >
      {items.map((it) => (
        <div key={it.label} className="bg-surface px-4 py-3">
          <div className="text-xs font-medium text-muted">{it.label}</div>
          <div className="tabular mt-0.5 text-base font-semibold tracking-tight text-ink">
            {it.value}
          </div>
          {it.sub && <div className="text-xs text-faint">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const CHIP: Record<Semaforo, string> = {
  verde: "bg-ok-soft text-ok",
  ambar: "bg-warn-soft text-warn",
  rojo: "bg-bad-soft text-bad",
};

export function Chip({
  estado,
  children,
}: {
  estado: Semaforo;
  children: ReactNode;
}) {
  return (
    <span className={`tabular rounded-md px-2 py-0.5 text-xs font-semibold ${CHIP[estado]}`}>
      {children}
    </span>
  );
}

/** Clases de un chip de seleccion (selector de unidad en P&L, estacionalidad). */
export function pillClass(activo: boolean): string {
  return `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
    activo
      ? "border-brand bg-brand text-white shadow-sm"
      : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
  }`;
}

/** Estado vacio con icono, titulo y texto. */
export function EmptyState({
  icono,
  titulo,
  children,
}: {
  icono?: ReactNode;
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      {icono && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icono}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
