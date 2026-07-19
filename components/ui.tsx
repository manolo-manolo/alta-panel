import type { ReactNode } from "react";
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
    <div
      className={`rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
      {children}
    </h2>
  );
}

/** Insignia de variacion relativa. Positivo verde, negativo rojo. */
export function DeltaBadge({
  fraccion,
  etiqueta,
}: {
  fraccion: number | null;
  etiqueta: string;
}) {
  if (fraccion === null) {
    return <span className="text-xs text-faint">{etiqueta} n/d</span>;
  }
  const positivo = fraccion >= 0;
  const color = positivo ? "text-ok" : "text-bad";
  const flecha = positivo ? "▲" : "▼";
  return (
    <span className={`text-xs ${color}`}>
      {flecha} {pct(Math.abs(fraccion))}{" "}
      <span className="text-faint">{etiqueta}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  deltaMoM,
  deltaYoY,
  sub,
}: {
  label: string;
  value: string;
  deltaMoM?: number | null;
  deltaYoY?: number | null;
  sub?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="tabular text-2xl font-semibold text-ink">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {(deltaMoM !== undefined || deltaYoY !== undefined) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {deltaMoM !== undefined && (
            <DeltaBadge fraccion={deltaMoM ?? null} etiqueta="vs mes ant." />
          )}
          {deltaYoY !== undefined && (
            <DeltaBadge fraccion={deltaYoY ?? null} etiqueta="vs ano ant." />
          )}
        </div>
      )}
    </Card>
  );
}

const DOT: Record<Semaforo, string> = {
  verde: "bg-ok",
  ambar: "bg-warn",
  rojo: "bg-bad",
};

export function StatusDot({ estado }: { estado: Semaforo | null }) {
  if (!estado) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-faint/40" />;
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[estado]}`}
      title={estado}
    />
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-faint">
        {label}
      </div>
      <div className="tabular mt-1 text-lg font-semibold text-ink">{value}</div>
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
    <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${CHIP[estado]}`}>
      {children}
    </span>
  );
}
