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
        <div className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-2.5 text-sm text-bad">
          La ultima sincronizacion fallo el {fechaHora(log?.finished_at)}. Se
          muestran los ultimos datos correctos.
          {log?.message ? (
            <span className="block text-xs opacity-80">{log.message}</span>
          ) : null}
        </div>
      )}
      {errores.length > 0 && (
        <details className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          <summary className="cursor-pointer font-medium">
            {errores.length} fila{errores.length === 1 ? "" : "s"} con errores en
            la hoja de costes
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
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
