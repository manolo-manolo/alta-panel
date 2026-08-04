"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, pct } from "@/lib/format";
import { CATEGORIA_LABEL, type Categoria } from "@/lib/config";

// Matriz de costes: unidades en filas, categorias en columnas, con total y
// peso sobre ingresos netos. Ordenable por cualquier columna.

export interface FilaCoste {
  listingId: string;
  nombre: string;
  valores: Record<string, number>; // categoria -> importe
  estimadas: Record<string, boolean>; // categoria -> tiene parte estimada
  total: number;
  netos: number; // ingresos netos del periodo (para el ratio)
}

export default function CostMatrix({
  filas,
  total,
  categorias,
  mes,
}: {
  filas: FilaCoste[];
  total: FilaCoste;
  categorias: string[]; // categorias con datos, ya ordenadas
  mes: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string>("total");
  const [desc, setDesc] = useState(true);

  const valor = (f: FilaCoste, key: string): number => {
    if (key === "total") return f.total;
    if (key === "ratio") return f.netos > 0 ? f.total / f.netos : -1;
    return f.valores[key] ?? 0;
  };

  const ordenadas = [...filas].sort((a, b) => {
    if (sortKey === "nombre") {
      return desc ? b.nombre.localeCompare(a.nombre) : a.nombre.localeCompare(b.nombre);
    }
    return desc ? valor(b, sortKey) - valor(a, sortKey) : valor(a, sortKey) - valor(b, sortKey);
  });

  function orden(key: string) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "nombre");
    }
  }

  const flecha = (key: string) => (sortKey === key ? (desc ? " ▼" : " ▲") : "");
  const th = "cursor-pointer px-2 py-2 text-right font-medium hover:text-ink whitespace-nowrap";

  const celdas = (f: FilaCoste, negrita = false) => (
    <>
      {categorias.map((c) => {
        const v = f.valores[c] ?? 0;
        return (
          <td
            key={c}
            className={`whitespace-nowrap px-2 py-2 text-right ${v === 0 ? "text-faint" : negrita ? "text-ink" : "text-muted"}`}
          >
            {v === 0 ? "-" : eur(v)}
            {f.estimadas[c] && (
              <span className="ml-0.5 text-brand" title="Incluye importes estimados">
                *
              </span>
            )}
          </td>
        );
      })}
      <td className="whitespace-nowrap border-l border-line/60 px-2 py-2 text-right font-semibold text-ink">
        {eur(f.total)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-muted">
        {f.netos > 0 ? pct(f.total / f.netos) : "-"}
      </td>
    </>
  );

  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th
              onClick={() => orden("nombre")}
              className="cursor-pointer px-2 py-2 text-left font-medium hover:text-ink"
            >
              Unidad{flecha("nombre")}
            </th>
            {categorias.map((c) => (
              <th key={c} onClick={() => orden(c)} className={th}>
                {CATEGORIA_LABEL[c as Categoria] ?? c}
                {flecha(c)}
              </th>
            ))}
            <th onClick={() => orden("total")} className={`${th} border-l border-line/60`}>
              Total{flecha("total")}
            </th>
            <th onClick={() => orden("ratio")} className={th}>
              % ingresos{flecha("ratio")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr
              key={f.listingId}
              onClick={() => router.push(`/unidad/${f.listingId}?mes=${mes}`)}
              className="cursor-pointer border-b border-line/60 hover:bg-surface-2"
            >
              <td className="whitespace-nowrap px-2 py-2 text-left font-medium text-ink">
                {f.nombre}
              </td>
              {celdas(f)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line font-semibold text-ink">
            <td className="px-2 py-2 text-left">{total.nombre}</td>
            {celdas(total, true)}
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-faint">
        * incluye importes estimados (run-rate), no facturas reales. % ingresos = opex del
        periodo sobre ingresos netos de la unidad. Clic en una fila para abrir la unidad.
      </p>
    </div>
  );
}
