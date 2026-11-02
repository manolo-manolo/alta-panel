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
    return <p className="text-sm text-muted">Sin datos de meses futuros.</p>;
  }
  return (
    <div>
      <div className="scroll-x">
        <table className="data-table min-w-[520px]">
          <thead>
            <tr>
              <th className="col-fija px-3 py-2 text-left">Mes</th>
              <th className="px-3 py-2 text-left">Ocupación reservada</th>
              <th className="px-3 py-2 text-right">ADR</th>
              <th className="px-3 py-2 text-right">RevPAR</th>
              <th className="px-3 py-2 text-right">Noches</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.mes}>
                <td className="col-fija px-3 py-2 text-left font-medium whitespace-nowrap capitalize">
                  {mesLabel(f.mes)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-14 shrink-0 rounded-full bg-surface-3 sm:w-24" aria-hidden>
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(1, f.occ ?? 0) * 100}%` }}
                      />
                    </div>
                    <span className="tabular w-12 text-right">{pct(f.occ)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{eur(f.adr)}</td>
                <td className="px-3 py-2 text-right text-muted">{eur(f.revpar)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-muted">
                  {num(f.noches)}/{num(f.disponibles)}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{eur(f.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-faint">
        Reservas ya confirmadas para cada mes. Navega a un mes futuro con el selector de mes para
        ver su detalle.
      </p>
    </div>
  );
}
