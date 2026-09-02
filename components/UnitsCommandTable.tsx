"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eur, pct, pctDirecto } from "@/lib/format";

// Tabla de mando por unidad: operacion (occ/ADR/RevPAR), resultado (ingresos,
// NOI, caja), rendimiento TTM, rating reciente y cartera a 30 dias.

export interface FilaMando {
  listingId: string;
  nombre: string;
  tipo: "propiedad" | "master_lease" | null;
  occ: number | null;
  adr: number | null;
  revpar: number | null;
  netos: number;
  noi: number;
  caja: number;
  rendimiento: number | null; // yield o margen TTM, en %
  rendimientoTipo: "yield" | "margen" | null;
  rating90: number | null;
  numReviews90: number;
  otbOcc: number | null;
  otbOccSTLY: number | null;
  otbNoches: number;
  otbDisponibles: number;
  costesPendientes: boolean;
}

type ColKey =
  | "nombre" | "occ" | "adr" | "revpar" | "netos" | "noi" | "caja"
  | "rendimiento" | "rating90" | "otbOcc";

const COLS: { key: ColKey; label: string }[] = [
  { key: "occ", label: "Occ" },
  { key: "adr", label: "ADR" },
  { key: "revpar", label: "RevPAR" },
  { key: "netos", label: "Ingresos" },
  { key: "noi", label: "NOI" },
  { key: "caja", label: "Caja" },
  { key: "rendimiento", label: "Yield/Margen" },
  { key: "rating90", label: "Rating 90d" },
  { key: "otbOcc", label: "OTB 30d" },
];

function valor(f: FilaMando, key: ColKey): number {
  switch (key) {
    case "nombre": return 0;
    case "occ": return f.occ ?? -1;
    case "adr": return f.adr ?? -1;
    case "revpar": return f.revpar ?? -1;
    case "netos": return f.netos;
    case "noi": return f.noi;
    case "caja": return f.caja;
    case "rendimiento": return f.rendimiento ?? -9999;
    case "rating90": return f.rating90 ?? -1;
    case "otbOcc": return f.otbOcc ?? -1;
  }
}

function Pace({ occ, stly }: { occ: number | null; stly: number | null }) {
  if (occ === null || stly === null || stly === 0) return null;
  const diff = occ - stly;
  if (Math.abs(diff) < 0.03) return null;
  return (
    <span
      className={`ml-1 text-[10px] ${diff > 0 ? "text-ok" : "text-bad"}`}
      title={`Mismo punto del ano pasado: ${pct(stly)}`}
    >
      {diff > 0 ? "▲" : "▼"}
    </span>
  );
}

export default function UnitsCommandTable({
  filas,
  total,
  mes,
}: {
  filas: FilaMando[];
  total: FilaMando;
  mes: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<ColKey>("noi");
  const [desc, setDesc] = useState(true);

  const ordenadas = [...filas].sort((a, b) => {
    if (sortKey === "nombre") {
      return desc ? b.nombre.localeCompare(a.nombre) : a.nombre.localeCompare(b.nombre);
    }
    return desc ? valor(b, sortKey) - valor(a, sortKey) : valor(a, sortKey) - valor(b, sortKey);
  });

  function orden(key: ColKey) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "nombre");
    }
  }
  const flecha = (key: ColKey) => (sortKey === key ? (desc ? " ▼" : " ▲") : "");

  const celdas = (f: FilaMando, fuerte = false) => (
    <>
      <td className="whitespace-nowrap px-2 py-2 text-right">{pct(f.occ)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right">{eur(f.adr)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-muted">{eur(f.revpar)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right">{eur(f.netos)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right">{eur(f.noi)}</td>
      <td
        className={`whitespace-nowrap px-2 py-2 text-right ${f.caja < 0 ? "text-bad" : fuerte ? "" : "text-ink"}`}
      >
        {eur(f.caja)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right">
        {f.rendimiento === null ? (
          <span className="text-faint">-</span>
        ) : (
          <>
            {pctDirecto(f.rendimiento)}
            <span className="ml-1 text-xs text-faint">
              {f.rendimientoTipo === "yield" ? "yield" : "margen"}
            </span>
          </>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right">
        {f.rating90 === null ? (
          <span className="text-faint">sin reviews</span>
        ) : (
          <span className={f.rating90 < 4.6 ? "text-bad" : f.rating90 >= 4.9 ? "text-ok" : ""}>
            {f.rating90.toFixed(2)}
            <span className="ml-1 text-xs text-faint">({f.numReviews90})</span>
          </span>
        )}
      </td>
      <td
        className="whitespace-nowrap px-2 py-2 text-right"
        title={`${f.otbNoches} de ${f.otbDisponibles} noches vendidas para los proximos 30 dias`}
      >
        {pct(f.otbOcc)}
        <Pace occ={f.otbOcc} stly={f.otbOccSTLY} />
      </td>
    </>
  );

  return (
    <div className="overflow-x-auto">
      <table className="tabular w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-faint">
            <th
              onClick={() => orden("nombre")}
              className="cursor-pointer px-2 py-2 text-left font-medium hover:text-ink"
            >
              Unidad{flecha("nombre")}
            </th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => orden(c.key)}
                className="cursor-pointer whitespace-nowrap px-2 py-2 text-right font-medium hover:text-ink"
              >
                {c.label}
                {flecha(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr
              key={f.listingId}
              onClick={() => router.push(`/unidad/${f.listingId}?mes=${mes}`)}
              className="cursor-pointer border-b border-line/60 text-ink hover:bg-surface-2"
            >
              <td className="whitespace-nowrap px-2 py-2 text-left font-medium">
                {f.nombre}
                {f.costesPendientes && (
                  <span className="ml-1 text-warn" title="Costes pendientes de cargar">
                    •
                  </span>
                )}
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
        Ingresos, NOI y caja del periodo seleccionado; yield/margen sobre los ultimos 12 meses;
        rating de los ultimos 90 dias; OTB = ocupacion ya reservada para los proximos 30 dias
        (▲▼ vs el mismo punto del ano pasado). Clic en una fila para abrir la unidad.
      </p>
    </div>
  );
}
