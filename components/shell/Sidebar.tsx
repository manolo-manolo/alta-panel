"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, RefreshCw } from "lucide-react";
import { NAV_GRUPOS, esActiva, hrefConContexto } from "@/components/shell/nav";
import { useSync } from "@/components/shell/useSync";
import { fechaHora } from "@/lib/format";

/** Navegacion lateral de escritorio (lg y superiores). */
export default function Sidebar({
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

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/" aria-label="Ir al resumen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="AltaHomes" className="h-[22px] w-auto" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones">
        {NAV_GRUPOS.map((g) => (
          <div key={g.titulo} className="mt-5 first:mt-1">
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              {g.titulo}
            </p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const activa = esActiva(it.href, pathname);
                const Icono = it.icon;
                return (
                  <li key={it.href}>
                    <a
                      href={hrefConContexto(it.href, mes, periodo)}
                      aria-current={activa ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                        activa
                          ? "bg-brand-soft font-semibold text-brand-ink"
                          : "font-medium text-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      <Icono size={17} strokeWidth={activa ? 2.25 : 2} aria-hidden />
                      {it.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <p className="px-1 text-xs text-faint" aria-live="polite">
          {aviso ? (
            <span className="font-medium text-brand">{aviso}</span>
          ) : (
            <>Datos: {ultima ? fechaHora(ultima) : "sin sincronizar"}</>
          )}
        </p>
        <button
          onClick={refrescar}
          disabled={refrescando}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:opacity-60"
        >
          <RefreshCw size={15} className={refrescando ? "animate-spin" : ""} aria-hidden />
          {refrescando ? "Actualizando…" : "Actualizar datos"}
        </button>
        <button
          onClick={salir}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
        >
          <LogOut size={16} aria-hidden />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
