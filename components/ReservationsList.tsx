import type { ReservaLista } from "@/lib/metrics";
import { eur, fecha } from "@/lib/format";
import { CANAL_LABEL, normalizarCanal } from "@/lib/config";

export default function ReservationsList({ reservas }: { reservas: ReservaLista[] }) {
  if (reservas.length === 0) {
    return <p className="py-4 text-sm text-muted">Sin reservas este mes.</p>;
  }
  return (
    <div className="scroll-x">
      <table className="data-table min-w-[640px]">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Entrada</th>
            <th className="px-3 py-2 text-left">Salida</th>
            <th className="px-3 py-2 text-left">Huésped</th>
            <th className="px-3 py-2 text-left">Canal</th>
            <th className="px-3 py-2 text-right">Noches</th>
            <th className="px-3 py-2 text-right">Alojamiento</th>
            <th className="px-3 py-2 text-right">Limpieza</th>
            <th className="px-3 py-2 text-right">Payout</th>
          </tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-left whitespace-nowrap">{fecha(r.checkIn)}</td>
              <td className="px-3 py-2 text-left whitespace-nowrap">{fecha(r.checkOut)}</td>
              <td className="px-3 py-2 text-left font-medium">{r.guest ?? "-"}</td>
              <td className="px-3 py-2 text-left text-muted">
                {CANAL_LABEL[normalizarCanal(r.source)]}
              </td>
              <td className="px-3 py-2 text-right">{r.nights}</td>
              <td className="px-3 py-2 text-right">{eur(r.alojamiento)}</td>
              <td className="px-3 py-2 text-right text-muted">{eur(r.limpieza)}</td>
              <td className="px-3 py-2 text-right font-medium">{eur(r.payout)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
