"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, num, pct } from "@/lib/format";

// Matriz de KPIs futuros por unidad: ocupacion y ADR on the books de las
// proximas ventanas de 15/30/60/90 dias, con indicador de ritmo vs el mismo
// punto del ano pasado en cada celda de ocupacion.

export interface VentanaFila {
  dias: number;
  occ: number | null;
  adr: number | null;
  occSTLY: number | null;
  adrSTLY: number | null;
  noches: number;
  disponibles: number;
  revenue: number;
}

export interface FilaForward {
  listingId: string;
  nombre: string;
  ventanas: VentanaFila[];
}

const VENTANAS = [15, 30, 60, 90];

function v(f: FilaForward, dias: number): VentanaFila | undefined {
  return f.ventanas.find((x) => x.dias === dias);
}

function Ritmo({ occ, occSTLY }: { occ: number | null; occSTLY: number | null }) {
  if (occ === null || occSTLY === null || occSTLY === 0) return null;
  const diff = occ - occSTLY;
  if (Math.abs(diff) < 0.03) return null;
  const arriba = diff > 0;
  return (
    <span
      className={`ml-1 text-[10px] ${arriba ? "text-ok" : "text-bad"}`}
      title={`Ritmo vs mismo punto del ano pasado: ${pct(occSTLY)} entonces`}
    >
      {arriba ? "▲" : "▼"}
    </span>
  );
}

export default function ForwardMatrix({
  filas,
  total,
  mes,
}: {
  filas: FilaForward[];
  total: FilaForward;
  mes: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string>("occ30");
  const [desc, setDesc] = useState(false);

  const valor = (f: FilaForward, key: string): number => {
    if (key === "nombre") return 0;
    const dias = Number(key.replace(/^\D+/, ""));
    const win = v(f, dias);
    if (!win) return -1;
    if (key.startsWith("occ")) return win.occ ?? -1;
    return win.adr ?? -1;
  };

  const ordenadas = [...filas].sort((a, b) => {
    if (sortKey === "nombre") {
      return desc ? b.nombre.localeCompare(a.nombre) : a.nombre.localeCompare(b.nombre);
    }
    const va = valor(a, sortKey);
    const vb = valor(b, sortKey);
    return desc ? vb - va : va - vb;
  });

  function orden(key: string) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key === "nombre" ? false : true);
    }
  }

  const flecha = (key: string) => (sortKey === key ? (desc ? " ▼" : " ▲") : "");

  const celdas = (f: FilaForward) =>
    VENTANAS.flatMap((dias) => {
      const win = v(f, dias);
      const titulo = win
        ? `${num(win.noches)} de ${num(win.disponibles)} noches vendidas · ${eur(win.revenue)} OTB`
        : undefined;
      return [
        <td
          key={`occ${dias}`}
          className="whitespace-nowrap px-2 py-2 text-right text-ink"
          title={titulo}
        >
          {win ? (
            <>
              {pct(win.occ)}
              <Ritmo occ={win.occ} occSTLY={win.occSTLY} />
            </>
          ) : (
            "-"
          )}
        </td>,
        <td
          key={`adr${dias}`}
          className="whitespace-nowrap border-r border-line/60 px-2 py-2 text-right text-muted last:border-r-0"
        >
          {win ? eur(win.adr) : "-"}
        </td>,
      ];
    });

  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line/60 text-xs text-faint">
            <th className="px-2 py-1" />
            {VENTANAS.map((d) => (
              <th
                key={d}
                colSpan={2}
                className="border-r border-line/60 px-2 py-1 text-center font-medium last:border-r-0"
              >
                {d} dias
              </th>
            ))}
          </tr>
          <tr className="border-b border-line text-xs text-faint">
            <th
              onClick={() => orden("nombre")}
              className="cursor-pointer px-2 py-2 text-left font-medium hover:text-ink"
            >
              Unidad{flecha("nombre")}
            </th>
            {VENTANAS.flatMap((d) => [
              <th
                key={`occ${d}`}
                onClick={() => orden(`occ${d}`)}
                className="cursor-pointer px-2 py-2 text-right font-medium hover:text-ink"
              >
                Occ{flecha(`occ${d}`)}
              </th>,
              <th
                key={`adr${d}`}
                onClick={() => orden(`adr${d}`)}
                className="cursor-pointer border-r border-line/60 px-2 py-2 text-right font-medium last:border-r-0 hover:text-ink"
              >
                ADR{flecha(`adr${d}`)}
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr
              key={f.listingId}
              onClick={() => router.push(`/unidad/${f.listingId}?mes=${mes}`)}
              className="cursor-pointer border-b border-line/60 hover:bg-surface-2"
            >
              <td className="px-2 py-2 text-left font-medium text-ink">{f.nombre}</td>
              {celdas(f)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold text-ink">
            <td className="px-2 py-2 text-left">{total.nombre}</td>
            {celdas(total)}
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-faint">
        On the books a dia de hoy. ▲▼ ritmo vs el mismo punto del ano pasado. Pasa el
        cursor por una celda para ver noches vendidas y revenue.
      </p>
    </div>
  );
}
