import type { Insight } from "@/lib/insights";
import InsightItem from "@/components/InsightItem";

export default function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return <p className="text-sm text-muted">Sin alertas relevantes en el periodo.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {insights.map((it, i) => (
        <InsightItem key={i} tono={it.tono} texto={it.texto} />
      ))}
    </div>
  );
}
