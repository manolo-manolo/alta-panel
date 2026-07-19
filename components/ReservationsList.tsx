import type { ReservaLista } from "@/lib/metrics";
import { eur, fecha } from "@/lib/format";
import { CANAL_LABEL, normalizarCanal } from "@/lib/config";

export default function ReservationsList({ reservas }: { reservas: ReservaLista[] }) {
  if (reservas.length === 0) {
    return <p className="py-4 text-sm text-faint">Sin reservas este mes.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th className="px-2 py-2 text-left font-medium">Entrada</th>
            <th className="px-2 py-2 text-left font-medium">Salida</th>
            <th className="px-2 py-2 text-left font-medium">Huesped</th>
            <th className="px-2 py-2 text-left font-medium">Canal</th>
            <th className="px-2 py-2 text-right font-medium">Noches</th>
            <th className="px-2 py-2 text-right font-medium">Alojamiento</th>
            <th className="px-2 py-2 text-right font-medium">Limpieza</th>
            <th className="px-2 py-2 text-right font-medium">Payout</th>
          </tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id} className="border-b border-line/60">
              <td className="px-2 py-1.5 text-left">{fecha(r.checkIn)}</td>
              <td className="px-2 py-1.5 text-left">{fecha(r.checkOut)}</td>
              <td className="px-2 py-1.5 text-left text-ink">{r.guest ?? "-"}</td>
              <td className="px-2 py-1.5 text-left text-muted">
                {CANAL_LABEL[normalizarCanal(r.source)]}
              </td>
              <td className="px-2 py-1.5 text-right">{r.nights}</td>
              <td className="px-2 py-1.5 text-right">{eur(r.alojamiento)}</td>
              <td className="px-2 py-1.5 text-right">{eur(r.limpieza)}</td>
              <td className="px-2 py-1.5 text-right text-ink">{eur(r.payout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
