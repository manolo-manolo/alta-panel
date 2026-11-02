"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoUnidad } from "@/lib/config";

export interface FilaAjuste {
  listingId: string;
  nickname: string;
  displayName: string;
  tipo: TipoUnidad | null;
  costeAdquisicion: number | null;
  rentaMensual: number | null;
  fechaInicio: string | null;
}

function Fila({ inicial }: { inicial: FilaAjuste }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(inicial.displayName ?? "");
  const [tipo, setTipo] = useState<string>(inicial.tipo ?? "");
  const [coste, setCoste] = useState(
    inicial.costeAdquisicion !== null ? String(inicial.costeAdquisicion) : "",
  );
  const [renta, setRenta] = useState(
    inicial.rentaMensual !== null ? String(inicial.rentaMensual) : "",
  );
  const [fecha, setFecha] = useState(inicial.fechaInicio ?? "");
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");

  async function guardar() {
    setEstado("guardando");
    try {
      const res = await fetch(`/api/unidades/${inicial.listingId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          tipo,
          costeAdquisicion: coste,
          rentaMensual: renta,
          fechaInicio: fecha,
        }),
      });
      if (res.ok) {
        setEstado("ok");
        router.refresh();
        setTimeout(() => setEstado("idle"), 2500);
      } else {
        setEstado("error");
      }
    } catch {
      setEstado("error");
    }
  }

  const input =
    "w-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15";

  return (
    <tr className="align-middle">
      <td className="px-3 py-2.5 text-xs text-faint">{inicial.nickname}</td>
      <td className="px-3 py-2.5">
        <input className={`${input} min-w-[10rem]`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={inicial.nickname} />
      </td>
      <td className="px-3 py-2.5">
        <select className={`${input} min-w-[9.5rem]`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Sin definir</option>
          <option value="propiedad">Propiedad</option>
          <option value="master_lease">Master lease</option>
        </select>
      </td>
      <td className="px-3 py-2.5">
        <input className={`${input} tabular text-right`} value={coste} onChange={(e) => setCoste(e.target.value)} inputMode="decimal" placeholder="0" />
      </td>
      <td className="px-3 py-2.5">
        <input className={`${input} tabular text-right`} value={renta} onChange={(e) => setRenta(e.target.value)} inputMode="decimal" placeholder="0" />
      </td>
      <td className="px-3 py-2.5">
        <input className={input} value={fecha} onChange={(e) => setFecha(e.target.value)} placeholder="YYYY-MM-DD" />
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={guardar}
          disabled={estado === "guardando"}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white shadow-sm transition hover:bg-brand-ink disabled:opacity-50"
        >
          {estado === "guardando" ? "..." : estado === "ok" ? "Guardado" : "Guardar"}
        </button>
        {estado === "error" && <span className="ml-2 text-xs text-bad">Error</span>}
      </td>
    </tr>
  );
}

export default function UnitSettingsEditor({ filas }: { filas: FilaAjuste[] }) {
  return (
    <div className="scroll-x">
      <table className="data-table min-w-[960px]">
        <thead>
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Nickname Guesty</th>
            <th className="px-3 py-2.5 text-left font-medium">Nombre a mostrar</th>
            <th className="px-3 py-2.5 text-left font-medium">Tipo</th>
            <th className="px-3 py-2.5 text-left font-medium">Coste adquisición (EUR)</th>
            <th className="px-3 py-2.5 text-left font-medium">Renta mensual (EUR)</th>
            <th className="px-3 py-2.5 text-left font-medium">Fecha inicio</th>
            <th className="px-3 py-2.5 text-left font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <Fila key={f.listingId} inicial={f} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
