"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Resumen {
  ok: boolean;
  grandParsed: number;
  operativo: number;
  excluidoComisiones: number;
  excluidoCapex: number;
  excluidoNoOperativa: number;
  unidadesNoReconocidas: string[];
  categoriasNoMapeadas: string[];
  filasCargadas: number;
  filasEstimadas: number;
  ibarra2Filas: number;
  mesesDetectados: string[];
}

function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function OpexUpload() {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNombre(file.name);
    setError(null);
    setResumen(null);
    setCargando(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/opex/upload", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });
      const data = await res.json();
      if (res.ok) {
        setResumen(data);
        router.refresh();
      } else {
        setError(data.error || "No se pudo procesar el archivo");
      }
    } catch {
      setError("Error al leer o enviar el archivo");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-medium text-white hover:bg-brand-ink">
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={cargando} />
        {cargando ? "Procesando..." : "Subir CSV de Opex"}
      </label>
      {nombre && <p className="text-sm text-muted">Archivo: {nombre}</p>}
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}

      {resumen && (
        <div className="rounded-lg border border-line bg-surface-2 p-4 text-sm">
          <p className="mb-2 font-semibold text-ok">Cargado correctamente</p>
          <ul className="space-y-1 text-muted">
            <li>Total en el archivo: <span className="tabular text-ink">{eur(resumen.grandParsed)}</span></li>
            <li>Coste operativo cargado: <span className="tabular text-ink">{eur(resumen.operativo)}</span> ({resumen.filasCargadas} filas)</li>
            <li>Excluido comisiones de canal: {eur(resumen.excluidoComisiones)}</li>
            <li>Excluido capex: {eur(resumen.excluidoCapex)}</li>
            <li>Excluido no operativo: {eur(resumen.excluidoNoOperativa)}</li>
            <li>Estimaciones regeneradas: {resumen.filasEstimadas} filas</li>
            <li>Meses detectados: {resumen.mesesDetectados[0]} a {resumen.mesesDetectados[resumen.mesesDetectados.length - 1]}</li>
          </ul>
          {resumen.unidadesNoReconocidas.length > 0 && (
            <p className="mt-2 text-warn">Unidades sin reconocer (no cargadas): {resumen.unidadesNoReconocidas.join(", ")}</p>
          )}
          {resumen.categoriasNoMapeadas.length > 0 && (
            <p className="mt-1 text-warn">Categorias sin mapear: {resumen.categoriasNoMapeadas.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
