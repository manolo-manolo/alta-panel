import { requireSesion } from "@/lib/session";
import TopBar from "@/components/TopBar";
import Banner from "@/components/Banner";
import { Card, SectionTitle } from "@/components/ui";
import { generarAcciones, type Accion } from "@/lib/acciones";
import { getUnidades, estadoDatos, mesPorDefecto } from "@/lib/metrics";
import { mesLabel, num } from "@/lib/format";

export const dynamic = "force-dynamic";

// Una sola bandeja priorizada con todo lo accionable del negocio: revenue,
// unidades y caja. Lo primero que se abre por la manana.

const ESTILO: Record<Accion["tono"], string> = {
  alerta: "border-l-bad bg-bad-soft/40",
  bueno: "border-l-ok bg-ok-soft/40",
  info: "border-l-brand bg-surface-2",
};
const ICONO: Record<Accion["tono"], string> = { alerta: "▲", bueno: "●", info: "◆" };
const ICONO_COLOR: Record<Accion["tono"], string> = {
  alerta: "text-bad",
  bueno: "text-ok",
  info: "text-brand",
};

function Bloque({ titulo, items }: { titulo: string; items: Accion[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <SectionTitle>{titulo}</SectionTitle>
      <div className="flex flex-col gap-2">
        {items.map((a, i) => (
          <a
            key={i}
            href={a.href}
            className={`flex gap-2 rounded-md border border-line border-l-4 px-3 py-2 text-sm transition hover:border-brand ${ESTILO[a.tono]}`}
          >
            <span className={`${ICONO_COLOR[a.tono]} shrink-0`}>{ICONO[a.tono]}</span>
            <span className="min-w-0 flex-1 text-ink">
              <span className="mr-1.5 rounded bg-canvas px-1.5 py-0.5 text-xs font-medium text-muted">
                {a.etiqueta}
              </span>
              {a.texto}
            </span>
            <span className="shrink-0 self-center text-faint">›</span>
          </a>
        ))}
      </div>
    </Card>
  );
}

export default async function AccionesPage() {
  await requireSesion();
  const mes = mesPorDefecto();

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  let unidades: { listingId: string; displayName: string }[] = [];
  try {
    unidades = await getUnidades();
  } catch {
    unidades = [];
  }

  const centro = await generarAcciones();
  const alertas = centro.acciones.filter((a) => a.tono === "alerta");
  const oportunidades = centro.acciones.filter((a) => a.tono === "bueno");
  const avisos = centro.acciones.filter((a) => a.tono === "info");

  return (
    <div className="min-h-screen">
      <TopBar
        mes={mes}
        periodo="mes"
        unidades={unidades.map((u) => ({ listingId: u.listingId, nombre: u.displayName }))}
        ultimaActualizacion={estado.ultimoExito}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <Banner estado={estado} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink">
            Acciones <span className="text-muted">· {mesLabel(centro.mes)}</span>
          </h1>
          <p className="text-sm text-muted">
            <span className="font-semibold text-bad">{num(centro.alertas)}</span> por hacer ·{" "}
            <span className="font-semibold text-ok">{num(centro.oportunidades)}</span>{" "}
            oportunidades ·{" "}
            <span className="font-semibold text-brand">{num(centro.avisos)}</span> avisos
          </p>
        </div>

        {centro.acciones.length === 0 && (
          <Card>
            <p className="text-sm text-faint">
              Nada pendiente: revenue, unidades y caja en banda.
            </p>
          </Card>
        )}

        <Bloque titulo="Hacer ya" items={alertas} />
        <Bloque titulo="Oportunidades" items={oportunidades} />
        <Bloque titulo="Avisos" items={avisos} />

        <p className="text-xs text-faint">
          Agrega revenue (vision futura), acciones por unidad y lectura del P&amp;L de caja sobre
          el mes actual y los ultimos 12 meses. Los consejos de costes estan en{" "}
          <a href="/costes" className="text-brand hover:underline">Costes</a> y los de la web en{" "}
          <a href="/web" className="text-brand hover:underline">Web</a>.
        </p>
      </main>
    </div>
  );
}
