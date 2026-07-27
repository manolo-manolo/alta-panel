import { eur, num, pct, mesLabel } from "@/lib/format";

// Tabla compacta de los proximos meses (on the books): que hay ya vendido
// para cada mes futuro. Complementa las ventanas de 15/30/60/90 dias.

export interface MesForward {
  mes: string;
  noches: number;
  disponibles: number;
  occ: number | null;
  adr: number | null;
  revpar: number | null;
  revenue: number; // alojamiento OTB
}

export default function ForwardMeses({ filas }: { filas: MesForward[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-faint">Sin datos de meses futuros.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="px-2 py-2 text-left font-medium">Mes</th>
            <th className="px-2 py-2 text-right font-medium">Ocupacion OTB</th>
            <th className="px-2 py-2 text-right font-medium">ADR OTB</th>
            <th className="px-2 py-2 text-right font-medium">RevPAR OTB</th>
            <th className="px-2 py-2 text-right font-medium">Noches</th>
            <th className="px-2 py-2 text-right font-medium">Revenue OTB</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.mes} className="border-b border-line/60">
              <td className="px-2 py-2 text-left font-medium capitalize text-ink">
                {mesLabel(f.mes)}
              </td>
              <td className="px-2 py-2 text-right text-ink">{pct(f.occ)}</td>
              <td className="px-2 py-2 text-right text-ink">{eur(f.adr)}</td>
              <td className="px-2 py-2 text-right text-muted">{eur(f.revpar)}</td>
              <td className="px-2 py-2 text-right text-muted">
                {num(f.noches)}/{num(f.disponibles)}
              </td>
              <td className="px-2 py-2 text-right text-ink">{eur(f.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-faint">
        Reservas ya confirmadas para cada mes. Usa el selector de mes de arriba para
        navegar a un mes futuro y ver su detalle completo.
      </p>
    </div>
  );
}
