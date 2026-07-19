import { semaforoNoiYield, type Semaforo, type TipoUnidad } from "@/lib/config";

const RANK: Record<Semaforo, number> = { verde: 0, ambar: 1, rojo: 2 };

/** Combina varios semaforos quedandose con el peor (rojo > ambar > verde). */
export function peorSemaforo(...vals: (Semaforo | null)[]): Semaforo | null {
  const presentes = vals.filter((v): v is Semaforo => v !== null);
  if (presentes.length === 0) return null;
  return presentes.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

/** Semaforo de ocupacion respecto a la media del portfolio. */
export function semaforoOcupacion(
  ocupacion: number | null,
  media: number | null,
): Semaforo | null {
  if (ocupacion === null || media === null || media === 0) return null;
  if (ocupacion >= media) return "verde";
  if (ocupacion >= media * 0.8) return "ambar";
  return "rojo";
}

/** Semaforo de rentabilidad segun tipo de unidad. */
export function semaforoRentabilidad(
  tipo: TipoUnidad | null,
  yieldPct: number | null,
  margenPct: number | null,
): Semaforo | null {
  if (tipo === "propiedad") return semaforoNoiYield(yieldPct);
  if (tipo === "master_lease") {
    if (margenPct === null) return null;
    if (margenPct >= 15) return "verde";
    if (margenPct >= 0) return "ambar";
    return "rojo";
  }
  return null;
}

/** Estado global de una unidad (ocupacion vs media + rentabilidad). */
export function estadoUnidad(params: {
  tipo: TipoUnidad | null;
  ocupacion: number | null;
  mediaOcupacion: number | null;
  yieldPct: number | null;
  margenPct: number | null;
}): Semaforo | null {
  return peorSemaforo(
    semaforoOcupacion(params.ocupacion, params.mediaOcupacion),
    semaforoRentabilidad(params.tipo, params.yieldPct, params.margenPct),
  );
}
