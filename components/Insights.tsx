import type { Insight } from "@/lib/insights";

const ESTILO: Record<Insight["tono"], string> = {
  alerta: "border-l-bad bg-bad-soft/40",
  bueno: "border-l-ok bg-ok-soft/40",
  info: "border-l-brand bg-surface-2",
};
const ICONO: Record<Insight["tono"], string> = {
  alerta: "▲",
  bueno: "●",
  info: "◆",
};
const ICONO_COLOR: Record<Insight["tono"], string> = {
  alerta: "text-bad",
  bueno: "text-ok",
  info: "text-brand",
};

export default function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return <p className="text-sm text-faint">Sin alertas relevantes en el periodo.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {insights.map((it, i) => (
        <div key={i} className={`flex gap-2 rounded-md border border-line border-l-4 px-3 py-2 text-sm ${ESTILO[it.tono]}`}>
          <span className={`${ICONO_COLOR[it.tono]} shrink-0`}>{ICONO[it.tono]}</span>
          <span className="text-ink">{it.texto}</span>
        </div>
      ))}
    </div>
  );
}
