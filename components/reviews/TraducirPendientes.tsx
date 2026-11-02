"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, LoaderCircle } from "lucide-react";

// Traduce y analiza las reviews pendientes por lotes (cada llamada cabe en
// el limite de tiempo de la funcion) hasta terminar.

export default function TraducirPendientes({ pendientes }: { pendientes: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "trabajando" | "hecho" | "error">("idle");
  const [hechas, setHechas] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function empezar() {
    setEstado("trabajando");
    setMensaje(null);
    let total = 0;
    try {
      for (let vuelta = 0; vuelta < 30; vuelta++) {
        const res = await fetch("/api/reviews/analizar", { method: "POST" });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d) {
          setEstado("error");
          setMensaje(d?.error ?? "No se pudo completar la traducción.");
          break;
        }
        if (!d.configurado) {
          setEstado("error");
          setMensaje(d.mensaje ?? "Falta configurar la API de Claude.");
          break;
        }
        total += d.analizadas;
        setHechas(total);
        if (d.mensaje) {
          setEstado("error");
          setMensaje(d.mensaje);
          break;
        }
        if (d.pendientes <= 0 || d.analizadas + d.errores === 0) {
          setEstado("hecho");
          if (d.errores > 0) setMensaje(`${d.errores} reviews no se pudieron analizar; se reintentarán.`);
          break;
        }
      }
    } catch {
      setEstado("error");
      setMensaje("Error de conexión.");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={empezar}
        disabled={estado === "trabajando"}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-ink disabled:opacity-60"
      >
        {estado === "trabajando" ? (
          <LoaderCircle size={15} className="animate-spin" aria-hidden />
        ) : (
          <Languages size={15} aria-hidden />
        )}
        {estado === "trabajando"
          ? `Traduciendo… ${hechas} de ${pendientes}`
          : `Traducir y analizar ${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"}`}
      </button>
      {estado === "hecho" && <span className="text-sm text-ok">Hecho: {hechas} reviews traducidas.</span>}
      {mensaje && <span className={`text-sm ${estado === "error" ? "text-bad" : "text-muted"}`}>{mensaje}</span>}
    </div>
  );
}
