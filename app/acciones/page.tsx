import { CircleAlert, Info, PiggyBank, TrendingUp, Zap } from "lucide-react";
import { requireSesion } from "@/lib/session";
import AppShell from "@/components/shell/AppShell";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import InsightItem from "@/components/InsightItem";
import { generarAcciones, type Accion } from "@/lib/acciones";
import { estadoDatos } from "@/lib/metrics";
import { mesLabel, num, eur } from "@/lib/format";

export const dynamic = "force-dynamic";

// Una sola bandeja priorizada con todo lo accionable del negocio: revenue,
// unidades y caja. Lo primero que se abre por la manana.

function Bloque({
  titulo,
  descripcion,
  items,
}: {
  titulo: string;
  descripcion: string;
  items: Accion[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader titulo={titulo} descripcion={descripcion} />
      <div className="flex flex-col gap-2">
        {items.map((a, i) => (
          <InsightItem
            key={i}
            tono={a.tono}
            texto={a.texto}
            etiqueta={a.etiqueta}
            impacto={a.impacto}
            href={a.href}
          />
        ))}
      </div>
    </Card>
  );
}

function Contador({
  icono,
  label,
  valor,
  estilo,
}: {
  icono: React.ReactNode;
  label: string;
  valor: string;
  estilo: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${estilo}`}>
        {icono}
      </span>
      <div className="min-w-0">
        <div className="tabular text-xl font-semibold tracking-tight text-ink">{valor}</div>
        <div className="text-xs font-medium text-muted">{label}</div>
      </div>
    </div>
  );
}

export default async function AccionesPage() {
  await requireSesion();

  let estado;
  try {
    estado = await estadoDatos();
  } catch {
    estado = { ultimoExito: null, ultimoLog: null };
  }

  const centro = await generarAcciones();
  const alertas = centro.acciones.filter((a) => a.tono === "alerta");
  const oportunidades = centro.acciones.filter((a) => a.tono === "bueno");
  const avisos = centro.acciones.filter((a) => a.tono === "info");

  return (
    <AppShell
      titulo="Acciones"
      subtitulo={`Qué tocar hoy para ganar más · ${mesLabel(centro.mes)}`}
      estado={estado}
      mes={centro.mes}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Contador
          icono={<CircleAlert size={18} aria-hidden />}
          label="Por hacer"
          valor={num(centro.alertas)}
          estilo="bg-bad-soft text-bad"
        />
        <Contador
          icono={<TrendingUp size={18} aria-hidden />}
          label="Oportunidades"
          valor={num(centro.oportunidades)}
          estilo="bg-ok-soft text-ok"
        />
        <Contador
          icono={<Info size={18} aria-hidden />}
          label="Avisos"
          valor={num(centro.avisos)}
          estilo="bg-brand-soft text-brand"
        />
        <Contador
          icono={<PiggyBank size={18} aria-hidden />}
          label="Potencial estimado"
          valor={centro.potencial > 0 ? eur(centro.potencial) : "-"}
          estilo="bg-surface-3 text-ink"
        />
      </div>

      {centro.acciones.length === 0 && (
        <Card>
          <EmptyState icono={<Zap size={18} aria-hidden />} titulo="Nada pendiente">
            Revenue, unidades y caja están en banda.
          </EmptyState>
        </Card>
      )}

      <Bloque
        titulo="Hacer ya"
        descripcion="Alertas ordenadas por euros en juego"
        items={alertas}
      />
      <Bloque
        titulo="Oportunidades"
        descripcion="Dinero que se puede capturar subiendo precio, rellenando huecos o ajustando reglas"
        items={oportunidades}
      />
      <Bloque titulo="Avisos" descripcion="A vigilar, sin acción urgente" items={avisos} />

      <p className="text-xs text-faint">
        Ordenadas por severidad y, dentro de cada bloque, por euros estimados (supuestos
        conservadores: +10% de precio sobre noches por vender, relleno parcial de huecos y noches
        libres, margen por noche real de cada unidad). Los consejos de costes están en{" "}
        <a href="/costes" className="text-brand hover:underline">
          Costes
        </a>{" "}
        y los de la web en{" "}
        <a href="/web" className="text-brand hover:underline">
          Web
        </a>
        .
      </p>
    </AppShell>
  );
}
