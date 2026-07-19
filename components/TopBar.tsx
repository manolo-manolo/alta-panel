"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { sumarMeses } from "@/lib/time";
import { mesLabel, fechaHora } from "@/lib/format";

interface UnidadOpt {
  listingId: string;
  nombre: string;
}

export default function TopBar({
  mes,
  periodo = "mes",
  unidades,
  unidadId,
  ultimaActualizacion,
}: {
  mes: string;
  periodo?: string;
  unidades: UnidadOpt[];
  unidadId?: string;
  ultimaActualizacion: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [refrescando, setRefrescando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function irA(path: string, nuevoMes: string, nuevoPeriodo: string) {
    startTransition(() => {
      router.push(`${path}?mes=${nuevoMes}&periodo=${nuevoPeriodo}`);
    });
  }

  function cambiarMes(nuevoMes: string) {
    irA(pathname, nuevoMes, periodo);
  }

  function cambiarPeriodo(nuevoPeriodo: string) {
    irA(pathname, mes, nuevoPeriodo);
  }

  function cambiarUnidad(valor: string) {
    const path = valor === "" ? "/" : `/unidad/${valor}`;
    irA(path, mes, periodo);
  }

  async function refrescar() {
    setRefrescando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAviso("Datos actualizados");
        router.refresh();
      } else if (res.status === 429) {
        setAviso(data.error || "Espera unos minutos");
      } else {
        setAviso(data.error || "No se pudo actualizar");
      }
    } catch {
      setAviso("Error de conexion");
    } finally {
      setRefrescando(false);
      setTimeout(() => setAviso(null), 6000);
    }
  }

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-base font-semibold tracking-tight text-brand">
            Alta Panel
          </a>
          {unidadId && (
            <span className="rounded-md bg-canvas px-2 py-0.5 text-xs text-muted">
              vista de unidad
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de mes */}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface">
            <button
              onClick={() => cambiarMes(sumarMeses(mes, -1))}
              className="px-2 py-1.5 text-muted hover:text-ink"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="min-w-28 text-center text-sm font-medium capitalize">
              {mesLabel(mes)}
            </span>
            <button
              onClick={() => cambiarMes(sumarMeses(mes, 1))}
              className="px-2 py-1.5 text-muted hover:text-ink"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          {/* Selector de periodo */}
          <select
            value={periodo}
            onChange={(e) => cambiarPeriodo(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="mes">Mes</option>
            <option value="ytd">YTD</option>
            <option value="ttm">TTM</option>
            <option value="ano">Ano</option>
          </select>

          {/* Selector de unidad */}
          <select
            value={unidadId ?? ""}
            onChange={(e) => cambiarUnidad(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">Todo el portfolio</option>
            {unidades.map((u) => (
              <option key={u.listingId} value={u.listingId}>
                {u.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={refrescar}
            disabled={refrescando || pending}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {refrescando ? "Actualizando..." : "Actualizar datos"}
          </button>

          <a
            href="/ajustes"
            className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
          >
            Ajustes
          </a>

          <button
            onClick={salir}
            className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ink"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-2 text-xs text-faint">
        <span>
          Datos actualizados: {ultimaActualizacion ? fechaHora(ultimaActualizacion) : "sin datos"}
        </span>
        {aviso && <span className="text-brand">{aviso}</span>}
      </div>
    </header>
  );
}
