"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace(next || "/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo iniciar sesion");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-muted">
          Contrasena
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="Introduce la contrasena"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={cargando || password.length === 0}
        className="rounded-lg bg-brand px-4 py-2.5 font-medium text-white transition hover:bg-brand-ink disabled:opacity-50"
      >
        {cargando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
