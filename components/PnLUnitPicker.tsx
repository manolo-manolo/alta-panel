"use client";

import { useRouter } from "next/navigation";

export default function PnLUnitPicker({
  mes,
  periodo,
  pnl,
  unidades,
}: {
  mes: string;
  periodo: string;
  pnl: string;
  unidades: { listingId: string; nombre: string }[];
}) {
  const router = useRouter();
  return (
    <select
      value={pnl}
      onChange={(e) =>
        router.push(`/?mes=${mes}&periodo=${periodo}&pnl=${e.target.value}#pnl`)
      }
      className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
    >
      <option value="">Todo el portfolio</option>
      {unidades.map((u) => (
        <option key={u.listingId} value={u.listingId}>
          {u.nombre}
        </option>
      ))}
    </select>
  );
}
