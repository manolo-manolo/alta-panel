"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut, RefreshCw, X } from "lucide-react";
import {
  NAV_MOVIL,
  NAV_TODOS,
  esActiva,
  hrefConContexto,
} from "@/components/shell/nav";
import { useSync } from "@/components/shell/useSync";
import { fechaHora } from "@/lib/format";

const CORTAS: Record<string, string> = { "/pnl": "P&L" };

/** Barra superior, barra inferior de pestanas y hoja "Mas" (solo movil y tablet). */
export default function MobileNav({
  mes,
  periodo,
  ultima,
}: {
  mes?: string;
  periodo?: string;
  ultima: string | null;
}) {
  const pathname = usePathname();
  const { refrescando, aviso, refrescar, salir } = useSync();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const fijas = NAV_MOVIL.map((h) => NAV_TODOS.find((n) => n.href === h)!).filter(Boolean);
  const resto = NAV_TODOS.filter((n) => !NAV_MOVIL.includes(n.href));
  const masActiva = resto.some((n) => esActiva(n.href, pathname));

  return (
    <div className="lg:hidden">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur-md">
        <Link href="/" aria-label="Ir al resumen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="AltaHomes" className="h-5 w-auto" />
        </Link>
        <button
          onClick={refrescar}
          disabled={refrescando}
          aria-label="Actualizar datos"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-60"
        >
          <RefreshCw size={18} className={refrescando ? "animate-spin" : ""} aria-hidden />
        </button>
      </header>

      {aviso && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-40 flex justify-center px-4"
        >
          <span className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-pop">
            {aviso}
          </span>
        </div>
      )}

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {fijas.map((it) => {
            const activa = esActiva(it.href, pathname);
            const Icono = it.icon;
            return (
              <li key={it.href}>
                <a
                  href={hrefConContexto(it.href, mes, periodo)}
                  aria-current={activa ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                    activa ? "text-brand" : "text-faint hover:text-ink"
                  }`}
                >
                  <Icono size={21} strokeWidth={activa ? 2.25 : 1.9} aria-hidden />
                  {CORTAS[it.href] ?? it.label}
                </a>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setAbierto(true)}
              aria-expanded={abierto}
              className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                masActiva ? "text-brand" : "text-faint hover:text-ink"
              }`}
            >
              <Ellipsis size={21} aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>

      {abierto && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={() => setAbierto(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-pop">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-ink">Más secciones</p>
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {resto.map((it) => {
                const activa = esActiva(it.href, pathname);
                const Icono = it.icon;
                return (
                  <li key={it.href}>
                    <a
                      href={hrefConContexto(it.href, mes, periodo)}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                        activa
                          ? "border-brand/30 bg-brand-soft text-brand-ink"
                          : "border-line text-ink hover:bg-surface-2"
                      }`}
                    >
                      <Icono size={18} aria-hidden />
                      {it.label}
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="text-xs text-faint">
                Datos: {ultima ? fechaHora(ultima) : "sin sincronizar"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAbierto(false);
                    refrescar();
                  }}
                  disabled={refrescando}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink disabled:opacity-60"
                >
                  <RefreshCw size={14} aria-hidden />
                  Actualizar
                </button>
                <button
                  onClick={salir}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted"
                >
                  <LogOut size={14} aria-hidden />
                  Salir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
