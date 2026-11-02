import type { ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";
import MobileNav from "@/components/shell/MobileNav";
import ContextBar, { type UnidadOpt } from "@/components/shell/ContextBar";
import Banner from "@/components/Banner";
import type { EstadoDatos } from "@/lib/metrics";

export interface Contexto {
  mes: string;
  periodo?: string;
  /** Si se pasa, muestra el selector de unidad (portfolio o una unidad). */
  unidades?: UnidadOpt[];
  unidadId?: string;
}

/**
 * Estructura comun de todas las paginas: navegacion (lateral en escritorio,
 * barra inferior en movil), cabecera de pagina, controles de contexto
 * opcionales y aviso de sincronizacion.
 */
export default function AppShell({
  titulo,
  subtitulo,
  acciones,
  contexto,
  estado,
  mes,
  periodo,
  ancho = "normal",
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  contexto?: Contexto;
  estado: EstadoDatos;
  /** Mes y periodo a conservar en los enlaces cuando la pagina no muestra contexto. */
  mes?: string;
  periodo?: string;
  ancho?: "normal" | "estrecho";
  children: ReactNode;
}) {
  const mesNav = contexto?.mes ?? mes;
  const periodoNav = contexto?.periodo ?? periodo;
  return (
    <div className="min-h-screen">
      <Sidebar mes={mesNav} periodo={periodoNav} ultima={estado.ultimoExito} />
      <MobileNav mes={mesNav} periodo={periodoNav} ultima={estado.ultimoExito} />
      <div className="pt-14 lg:pt-0 lg:pl-60">
        <main
          className={`mx-auto w-full px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12 ${
            ancho === "estrecho" ? "max-w-3xl" : "max-w-[1360px]"
          }`}
        >
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-ink sm:text-2xl">
                {titulo}
              </h1>
              {subtitulo && <p className="mt-1 text-sm text-muted">{subtitulo}</p>}
            </div>
            {acciones && <div className="flex max-w-full min-w-0 items-center gap-2 sm:shrink-0">{acciones}</div>}
          </header>
          {contexto && (
            <ContextBar
              mes={contexto.mes}
              periodo={contexto.periodo}
              unidades={contexto.unidades}
              unidadId={contexto.unidadId}
            />
          )}
          <div className="flex flex-col gap-4 sm:gap-5">
            <Banner estado={estado} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
