import { CircleAlert, TriangleAlert } from "lucide-react";
import type { EstadoDatos } from "@/lib/metrics";
import type { FilaError } from "@/lib/sheets";
import { fechaHora } from "@/lib/format";

export default function Banner({ estado }: { estado: EstadoDatos }) {
  const log = estado.ultimoLog;
  const errores = Array.isArray(log?.row_errors)
    ? (log?.row_errors as FilaError[])
    : [];

  const syncFallido = log?.status === "error";

  if (!syncFallido && errores.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {syncFallido && (
        <div className="flex gap-3 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-sm text-bad">
          <CircleAlert size={18} className="mt-px shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              La última sincronización falló el {fechaHora(log?.finished_at)}. Se muestran los
              últimos datos correctos.
            </p>
            {log?.message ? <p className="mt-0.5 text-xs opacity-80">{log.message}</p> : null}
          </div>
        </div>
      )}
      {errores.length > 0 && (
        <details className="rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <TriangleAlert size={16} className="shrink-0" aria-hidden />
            {errores.length} fila{errores.length === 1 ? "" : "s"} con errores en la hoja de costes
          </summary>
          <ul className="mt-2 space-y-1 pl-6 text-xs">
            {errores.slice(0, 50).map((e, i) => (
              <li key={i}>
                <span className="font-medium">
                  {e.hoja}
                  {e.fila > 0 ? ` fila ${e.fila}` : ""}:
                </span>{" "}
                {e.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
