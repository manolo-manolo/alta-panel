import "server-only";
import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Agregados de costes para la vista dedicada de costes (/costes).
// Una sola consulta por unidad x categoria x mes; la pagina agrega en JS
// segun necesite (matriz del periodo, serie TTM para picos, % estimado).
// ---------------------------------------------------------------------------

export interface CosteCelda {
  unidad: string; // nickname (clave de union con listings.nickname)
  categoria: string;
  mes: string;
  importe: number;
  importeEstimado: number; // parte del importe marcada como estimada
}

export async function costesUnidadCategoriaMes(
  meses: string[],
): Promise<CosteCelda[]> {
  const rows = await query<{
    unidad: string;
    categoria: string;
    mes: string;
    importe: number;
    importe_estimado: number;
  }>(
    `SELECT unidad, categoria, mes,
            COALESCE(SUM(importe_eur),0)::float AS importe,
            COALESCE(SUM(importe_eur) FILTER (WHERE estimado),0)::float AS importe_estimado
     FROM cost_rows
     WHERE mes = ANY($1)
     GROUP BY unidad, categoria, mes`,
    [meses],
  );
  return rows.map((r) => ({
    unidad: r.unidad,
    categoria: r.categoria,
    mes: r.mes,
    importe: r.importe,
    importeEstimado: r.importe_estimado,
  }));
}
