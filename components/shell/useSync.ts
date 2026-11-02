"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Sincronizacion manual con Guesty y cierre de sesion (compartido por la navegacion). */
export function useSync() {
  const router = useRouter();
  const [refrescando, setRefrescando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function refrescar() {
    if (refrescando) return;
    setRefrescando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAviso("Datos actualizados");
        router.refresh();
        // Reviews nuevas: traduccion y analisis en segundo plano.
        fetch("/api/reviews/analizar", { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && d.analizadas > 0) router.refresh();
          })
          .catch(() => {});
      } else if (res.status === 429) {
        setAviso(data.error || "Espera unos minutos");
      } else {
        setAviso(data.error || "No se pudo actualizar");
      }
    } catch {
      setAviso("Error de conexión");
    } finally {
      setRefrescando(false);
      setTimeout(() => setAviso(null), 6000);
    }
  }

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return { refrescando, aviso, refrescar, salir };
}
