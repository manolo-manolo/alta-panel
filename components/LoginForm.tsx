"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";

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
        setError(data.error || "No se pudo iniciar sesión");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Contraseña
        </label>
        <div className="relative">
          <KeyRound
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface py-2.5 pr-3 pl-9 text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Introduce la contraseña"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={cargando || password.length === 0}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {cargando && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
        {cargando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
