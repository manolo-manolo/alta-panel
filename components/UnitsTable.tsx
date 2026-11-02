"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusDot } from "@/components/ui";
import { eur, pct, pctDirecto } from "@/lib/format";
import type { Semaforo, TipoUnidad } from "@/lib/config";

export interface FilaUnidad {
  listingId: string;
  nickname: string;
  tipo: TipoUnidad | null;
  ocupacion: number | null;
  adr: number | null;
  revpar: number | null;
  netos: number;
  noiMes: number;
  noiTTM: number;
  rendimiento: number | null;
  rendimientoTipo: "yield" | "margen" | null;
  /** Yield sobre ritmo anual: la unidad opero menos de 12 meses. */
  rendimientoAnualizado?: boolean;
  mesesOperando?: number;
  estado: Semaforo | null;
  costesPendientes: boolean;
}

type Col = {
  key: keyof FilaUnidad | "rend";
  label: string;
  align: "left" | "right";
  render: (f: FilaUnidad) => React.ReactNode;
  valor: (f: FilaUnidad) => number;
};

export default function UnitsTable({
  filas,
  mes,
  total,
}: {
  filas: FilaUnidad[];
  mes: string;
  total?: FilaUnidad;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string>("noiTTM");
  const [desc, setDesc] = useState(true);

  const cols: Col[] = [
    {
      key: "ocupacion", label: "Ocupación", align: "right",
      render: (f) => pct(f.ocupacion), valor: (f) => f.ocupacion ?? -1,
    },
    {
      key: "adr", label: "ADR", align: "right",
      render: (f) => eur(f.adr), valor: (f) => f.adr ?? -1,
    },
    {
      key: "revpar", label: "RevPAR", align: "right",
      render: (f) => eur(f.revpar), valor: (f) => f.revpar ?? -1,
    },
    {
      key: "netos", label: "Ing. netos", align: "right",
      render: (f) => eur(f.netos), valor: (f) => f.netos,
    },
    {
      key: "noiMes", label: "NOI", align: "right",
      render: (f) => eur(f.noiMes), valor: (f) => f.noiMes,
    },
    {
      key: "noiTTM", label: "NOI TTM", align: "right",
      render: (f) => eur(f.noiTTM), valor: (f) => f.noiTTM,
    },
    {
      key: "rend", label: "Yield / Margen", align: "right",
      render: (f) =>
        f.rendimiento === null ? (
          <span className="text-faint">-</span>
        ) : (
          <span
            title={
              f.rendimientoAnualizado
                ? `Anualizado: ${f.mesesOperando !== undefined ? `${Math.round(f.mesesOperando)} meses operando` : "menos de 12 meses operando"}, ajustado por estacionalidad`
                : undefined
            }
          >
            {pctDirecto(f.rendimiento)}
            <span className="ml-1 text-xs text-faint">
              {f.rendimientoTipo === "yield" ? (f.rendimientoAnualizado ? "anual." : "yield") : "margen"}
            </span>
          </span>
        ),
      valor: (f) => f.rendimiento ?? -9999,
    },
  ];

  const colValor = (f: FilaUnidad, key: string): number => {
    if (key === "nickname") return 0;
    const col = cols.find((c) => c.key === key);
    if (col) return col.valor(f);
    return 0;
  };

  const ordenadas = [...filas].sort((a, b) => {
    if (sortKey === "nickname") {
      return desc
        ? b.nickname.localeCompare(a.nickname)
        : a.nickname.localeCompare(b.nickname);
    }
    const va = colValor(a, sortKey);
    const vb = colValor(b, sortKey);
    return desc ? vb - va : va - vb;
  });

  function orden(key: string) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const flecha = (key: string) => (sortKey === key ? (desc ? " ↓" : " ↑") : "");

  return (
    <div className="scroll-x">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th
              onClick={() => orden("nickname")}
              className="col-fija cursor-pointer px-3 py-2.5 text-left font-medium hover:text-ink"
            >
              Unidad{flecha("nickname")}
            </th>
            {cols.map((c) => (
              <th
                key={String(c.key)}
                onClick={() => orden(String(c.key))}
                className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-ink"
              >
                {c.label}
                {flecha(String(c.key))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr
              key={f.listingId}
              onClick={() => router.push(`/unidad/${f.listingId}?mes=${mes}`)}
              className="cursor-pointer border-b border-line/60 hover:bg-surface-2"
            >
              <td className="col-fija whitespace-nowrap px-3 py-2.5 text-left">
                <div className="flex items-center gap-2">
                  <StatusDot estado={f.estado} />
                  <span className="font-medium text-ink">{f.nickname}</span>
                  {f.costesPendientes && (
                    <span
                      className="text-warn"
                      title="Costes pendientes en la hoja"
                    >
                      •
                    </span>
                  )}
                </div>
              </td>
              {cols.map((c) => (
                <td key={String(c.key)} className="px-3 py-2.5 text-right text-ink">
                  {c.render(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t-2 border-line font-semibold text-ink">
              <td className="col-fija whitespace-nowrap px-3 py-2.5 text-left">{total.nickname}</td>
              {cols.map((c) => (
                <td key={String(c.key)} className="px-3 py-2.5 text-right">
                  {c.render(total)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
