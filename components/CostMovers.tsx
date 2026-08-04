import { eur } from "@/lib/format";

// Mayores variaciones de coste por concepto vs el mismo periodo del ano
// anterior: donde se esta yendo el dinero (o donde se esta ahorrando).

export interface Movimiento {
  etiqueta: string;
  actual: number;
  anterior: number;
}

export default function CostMovers({ movers }: { movers: Movimiento[] }) {
  const conDelta = movers
    .map((m) => ({ ...m, delta: m.actual - m.anterior }))
    .filter((m) => Math.abs(m.delta) >= 50);
  const subidas = conDelta.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 6);
  const bajadas = conDelta.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 6);

  if (subidas.length === 0 && bajadas.length === 0) {
    return (
      <p className="text-sm text-faint">
        Sin variaciones relevantes vs el mismo periodo del ano pasado.
      </p>
    );
  }

  const bloque = (titulo: string, items: typeof subidas, color: string) => (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-faint">Ninguna.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((m) => (
            <li key={m.etiqueta} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-muted" title={m.etiqueta}>
                {m.etiqueta}
              </span>
              <span className={`tabular shrink-0 font-medium ${color}`}>
                {m.delta > 0 ? "+" : ""}
                {eur(m.delta)}
                <span className="ml-1 text-xs font-normal text-faint">
                  ({eur(m.anterior)} → {eur(m.actual)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {bloque("Mayores subidas", subidas, "text-bad")}
      {bloque("Mayores bajadas", bajadas, "text-ok")}
    </div>
  );
}
