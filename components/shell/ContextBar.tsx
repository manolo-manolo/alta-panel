"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { sumarMeses } from "@/lib/time";
import { mesLabel } from "@/lib/format";

export interface UnidadOpt {
  listingId: string;
  nombre: string;
}

const PERIODOS = [
  { v: "mes", l: "Mes" },
  { v: "ytd", l: "YTD" },
  { v: "ttm", l: "12 meses" },
  { v: "ano", l: "Año" },
];

/** Controles de contexto: mes, periodo y (opcional) unidad. */
export default function ContextBar({
  mes,
  periodo = "mes",
  unidades,
  unidadId,
}: {
  mes: string;
  periodo?: string;
  unidades?: UnidadOpt[];
  unidadId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function irA(path: string, nuevoMes: string, nuevoPeriodo: string) {
    startTransition(() => {
      router.push(`${path}?mes=${nuevoMes}&periodo=${nuevoPeriodo}`);
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div className="flex w-full items-center justify-between rounded-lg border border-line bg-surface shadow-card sm:w-auto sm:shrink-0">
        <button
          onClick={() => irA(pathname, sumarMeses(mes, -1), periodo)}
          className="flex h-10 w-11 items-center justify-center rounded-l-lg text-muted transition hover:bg-surface-2 hover:text-ink sm:h-9 sm:w-9"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={17} aria-hidden />
        </button>
        <span className="min-w-[8.5rem] px-1 text-center text-sm font-semibold text-ink capitalize">
          {mesLabel(mes)}
        </span>
        <button
          onClick={() => irA(pathname, sumarMeses(mes, 1), periodo)}
          className="flex h-10 w-11 items-center justify-center rounded-r-lg text-muted transition hover:bg-surface-2 hover:text-ink sm:h-9 sm:w-9"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={17} aria-hidden />
        </button>
      </div>

      <div
        className="grid w-full grid-cols-4 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-card sm:flex sm:w-auto sm:shrink-0 sm:items-center"
        role="group"
        aria-label="Periodo"
      >
        {PERIODOS.map((p) => (
          <button
            key={p.v}
            onClick={() => irA(pathname, mes, p.v)}
            aria-pressed={periodo === p.v}
            className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition sm:py-1 ${
              periodo === p.v ? "bg-ink text-white" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {p.l}
          </button>
        ))}
      </div>

      {unidades && (
        <select
          value={unidadId ?? ""}
          onChange={(e) =>
            irA(e.target.value === "" ? "/" : `/unidad/${e.target.value}`, mes, periodo)
          }
          aria-label="Unidad"
          className="h-10 w-full rounded-lg border border-line bg-surface pr-8 pl-3 text-sm font-medium text-ink shadow-card outline-none focus:border-brand sm:h-[38px] sm:w-auto sm:shrink-0"
        >
          <option value="">Todo el portfolio</option>
          {unidades.map((u) => (
            <option key={u.listingId} value={u.listingId}>
              {u.nombre}
            </option>
          ))}
        </select>
      )}

      {pending && (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
          <LoaderCircle size={14} className="animate-spin" aria-hidden />
          Cargando…
        </span>
      )}
    </div>
  );
}
