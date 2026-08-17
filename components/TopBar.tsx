"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { sumarMeses } from "@/lib/time";
import { mesLabel, fechaHora } from "@/lib/format";

interface UnidadOpt {
  listingId: string;
  nombre: string;
}

const NAV = [
  { href: "/", label: "Panel" },
  { href: "/pnl", label: "P&L" },
  { href: "/costes", label: "Costes" },
  { href: "/web", label: "Web" },
  { href: "/opex", label: "Opex" },
  { href: "/ajustes", label: "Ajustes" },
];

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

  const esActiva = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/unidad") : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      {/* Fila 1: marca + navegacion + acciones */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pt-2.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-5">
          <a href="/" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-black.png" alt="AltaHomes" className="h-5 w-auto" />
          </a>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={`${n.href}?mes=${mes}&periodo=${periodo}`}
                className={`rounded-md px-2.5 py-1 text-sm whitespace-nowrap transition ${
                  esActiva(n.href)
                    ? "bg-brand/10 font-medium text-brand-ink"
                    : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={refrescar}
            disabled={refrescando || pending}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {refrescando ? "Actualizando..." : "Actualizar"}
          </button>
          <button
            onClick={salir}
            className="rounded-lg px-2 py-1.5 text-sm text-faint hover:text-ink"
            title="Cerrar sesion"
          >
            Salir
          </button>
        </div>
      </div>

      {/* Fila 2: controles de contexto */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-2">
        <div className="flex items-center rounded-lg border border-line bg-surface">
          <button
            onClick={() => cambiarMes(sumarMeses(mes, -1))}
            className="px-2.5 py-1 text-muted hover:text-ink"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <span className="min-w-28 text-center text-sm font-medium capitalize">
            {mesLabel(mes)}
          </span>
          <button
            onClick={() => cambiarMes(sumarMeses(mes, 1))}
            className="px-2.5 py-1 text-muted hover:text-ink"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>

        <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
          {[
            { v: "mes", l: "Mes" },
            { v: "ytd", l: "YTD" },
            { v: "ttm", l: "TTM" },
            { v: "ano", l: "Ano" },
          ].map((p) => (
            <button
              key={p.v}
              onClick={() => cambiarPeriodo(p.v)}
              className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                periodo === p.v
                  ? "bg-brand text-white"
                  : "text-muted hover:text-ink"
              }`}
            >
              {p.l}
            </button>
          ))}
        </div>

        <select
          value={unidadId ?? ""}
          onChange={(e) => cambiarUnidad(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="">Todo el portfolio</option>
          {unidades.map((u) => (
            <option key={u.listingId} value={u.listingId}>
              {u.nombre}
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-faint">
          {aviso ? (
            <span className="text-brand">{aviso}</span>
          ) : (
            <>Datos: {ultimaActualizacion ? fechaHora(ultimaActualizacion) : "sin sincronizar"}</>
          )}
        </span>
      </div>
    </header>
  );
}
