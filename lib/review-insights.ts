// Lo que dicen los huespedes: agrega el analisis de cada review (temas,
// sentimiento, mejoras) por tema y por unidad, y prioriza que arreglar.
// Puro y client-safe.

import type { ReviewCompleta, TemaAnalizado } from "@/lib/review-analysis";
import { TEMA_LABEL, TEMA_QUEJA, type TemaReview } from "@/lib/review-temas";
import { CATEGORIA_REVIEW_LABEL, type CategoriaReview } from "@/lib/review-texts";

export interface Cita {
  reviewId: string;
  texto: string;
  unidad: string;
  fecha: string | null;
}

export interface MencionTema {
  tema: TemaReview;
  label: string;
  positivas: number; // reviews con mencion positiva
  negativas: number; // reviews con mencion negativa
  citasPos: Cita[];
  citasNeg: Cita[];
  unidadesNeg: { nombre: string; n: number }[];
}

export interface Arreglo {
  listingId: string;
  unidad: string;
  tema: TemaReview;
  label: string;
  n: number; // reviews que lo mencionan como negativo
  recientes: number; // de ellas, en los ultimos 90 dias
  detalles: string[];
  mejora: string | null;
  ultima: string | null;
}

export interface ResumenUnidad {
  listingId: string;
  nombre: string;
  n: number;
  rating: number | null;
  pct5: number | null;
  queja: { label: string; n: number } | null;
  elogio: { label: string; n: number } | null;
  categoriaFloja: { label: string; nota: number } | null;
}

export interface InsightsReviews {
  n: number;
  analizadas: number;
  rating: number | null;
  pct5: number | null;
  conQueja: number; // reviews analizadas con al menos un tema negativo
  elogios: MencionTema[];
  quejas: MencionTema[];
  arreglos: Arreglo[];
  porUnidad: ResumenUnidad[];
  categorias: { categoria: CategoriaReview; label: string; nota: number; n: number }[];
}

const DIA_MS = 86_400_000;

function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** Temas unicos por review (una review que repite un tema cuenta una vez). */
function temasDe(r: ReviewCompleta, s: "positivo" | "negativo"): TemaAnalizado[] {
  const vistos = new Set<string>();
  return (r.analisis?.temas ?? []).filter((t) => {
    if (t.sentimiento !== s || vistos.has(t.tema)) return false;
    vistos.add(t.tema);
    return true;
  });
}

export function insightsReviews(
  reviews: ReviewCompleta[],
  nombres: Map<string, string>,
  hoy: string,
): InsightsReviews {
  const nombre = (id: string | null) => (id ? (nombres.get(id) ?? "Sin unidad") : "Sin unidad");
  const hace90 = new Date(new Date(`${hoy}T00:00:00Z`).getTime() - 90 * DIA_MS).toISOString().slice(0, 10);
  const conRating = reviews.filter((r) => r.rating !== null);
  const analizadas = reviews.filter((r) => r.analisis !== null);

  // --- Por tema ---
  const porTema = new Map<TemaReview, MencionTema>();
  const tema = (t: TemaReview) => {
    let m = porTema.get(t);
    if (!m) {
      m = { tema: t, label: TEMA_LABEL[t], positivas: 0, negativas: 0, citasPos: [], citasNeg: [], unidadesNeg: [] };
      porTema.set(t, m);
    }
    return m;
  };
  const negPorUnidadTema = new Map<string, Arreglo>();
  for (const r of analizadas) {
    const unidad = nombre(r.listingId);
    for (const t of temasDe(r, "positivo")) {
      const m = tema(t.tema);
      m.positivas++;
      if (m.citasPos.length < 3 && t.detalle) m.citasPos.push({ reviewId: r.id, texto: t.detalle, unidad, fecha: r.fecha });
    }
    for (const t of temasDe(r, "negativo")) {
      const m = tema(t.tema);
      m.negativas++;
      if (m.citasNeg.length < 3 && t.detalle) m.citasNeg.push({ reviewId: r.id, texto: t.detalle, unidad, fecha: r.fecha });
      const u = m.unidadesNeg.find((x) => x.nombre === unidad);
      if (u) u.n++;
      else m.unidadesNeg.push({ nombre: unidad, n: 1 });
      if (!r.listingId) continue;
      const k = `${r.listingId}|${t.tema}`;
      let a = negPorUnidadTema.get(k);
      if (!a) {
        a = {
          listingId: r.listingId,
          unidad,
          tema: t.tema,
          label: TEMA_LABEL[t.tema],
          n: 0,
          recientes: 0,
          detalles: [],
          mejora: null,
          ultima: null,
        };
        negPorUnidadTema.set(k, a);
      }
      a.n++;
      if (r.fecha && r.fecha.slice(0, 10) >= hace90) a.recientes++;
      if (t.detalle && a.detalles.length < 3 && !a.detalles.includes(t.detalle)) a.detalles.push(t.detalle);
      // Las reviews vienen de la mas reciente a la mas antigua: la primera
      // mejora es la mas actual.
      if (!a.mejora && t.mejora) a.mejora = t.mejora;
      if (!a.ultima) a.ultima = r.fecha;
    }
  }
  for (const m of porTema.values()) m.unidadesNeg.sort((a, b) => b.n - a.n);
  const temas = [...porTema.values()].filter((m) => m.tema !== "otros" || m.negativas + m.positivas >= 3);
  const elogios = temas.filter((m) => m.positivas > 0).sort((a, b) => b.positivas - a.positivas).slice(0, 6);
  const quejas = temas.filter((m) => m.negativas > 0).sort((a, b) => b.negativas - a.negativas).slice(0, 6);

  // Que arreglar primero: lo que se repite y lo reciente pesa mas.
  const arreglos = [...negPorUnidadTema.values()].sort(
    (a, b) => b.n + b.recientes - (a.n + a.recientes) || (b.ultima ?? "").localeCompare(a.ultima ?? ""),
  );

  // --- Por unidad ---
  const ids = [...new Set(reviews.map((r) => r.listingId).filter((x): x is string => !!x))];
  const porUnidad: ResumenUnidad[] = ids
    .map((id) => {
      const rs = reviews.filter((r) => r.listingId === id);
      const notas = rs.map((r) => r.rating).filter((x): x is number => x !== null);
      const contar = (s: "positivo" | "negativo") => {
        const c = new Map<TemaReview, number>();
        for (const r of rs) for (const t of temasDe(r, s)) c.set(t.tema, (c.get(t.tema) ?? 0) + 1);
        const top = [...c.entries()].filter(([t]) => t !== "otros").sort((a, b) => b[1] - a[1])[0];
        return top ? { label: TEMA_LABEL[top[0]], n: top[1] } : null;
      };
      const cats = categoriasDe(rs);
      const floja = cats.filter((c) => c.n >= 3).sort((a, b) => a.nota - b.nota)[0];
      return {
        listingId: id,
        nombre: nombre(id),
        n: rs.length,
        rating: media(notas),
        pct5: notas.length ? notas.filter((x) => x >= 4.95).length / notas.length : null,
        queja: contar("negativo"),
        elogio: contar("positivo"),
        categoriaFloja: floja && floja.nota < 4.9 ? { label: floja.label, nota: floja.nota } : null,
      };
    })
    .sort((a, b) => (a.rating ?? 9) - (b.rating ?? 9));

  const notas = conRating.map((r) => r.rating!) ;
  return {
    n: reviews.length,
    analizadas: analizadas.length,
    rating: media(notas),
    pct5: notas.length ? notas.filter((x) => x >= 4.95).length / notas.length : null,
    conQueja: analizadas.filter((r) => temasDe(r, "negativo").length > 0).length,
    elogios,
    quejas,
    arreglos,
    porUnidad,
    categorias: categoriasDe(reviews),
  };
}

function categoriasDe(rs: ReviewCompleta[]) {
  const acc = new Map<CategoriaReview, number[]>();
  for (const r of rs) {
    for (const c of r.textos.categorias) {
      const arr = acc.get(c.categoria) ?? [];
      arr.push(c.nota);
      acc.set(c.categoria, arr);
    }
  }
  return [...acc.entries()]
    .map(([categoria, xs]) => ({
      categoria,
      label: CATEGORIA_REVIEW_LABEL[categoria],
      nota: media(xs)!,
      n: xs.length,
    }))
    .sort((a, b) => a.nota - b.nota);
}

/**
 * Texto de una accion "que arreglar": "3 reseñas en los últimos 12 meses se
 * quejan de ruido (2 en los últimos 90 días): «...». Poner tapones...".
 */
export function textoArreglo(a: Arreglo, ventana: string): string {
  const sujeto = a.n === 1 ? `Una reseña ${ventana} se queja` : `${a.n} reseñas ${ventana} se quejan`;
  const reciente = a.recientes > 0 && a.recientes < a.n ? ` (${a.recientes} en los últimos 90 días)` : "";
  const cita = a.detalles.length ? `: «${a.detalles.slice(0, 2).join("», «")}»` : "";
  const mejora = a.mejora ? ` ${a.mejora.charAt(0).toUpperCase()}${a.mejora.slice(1).replace(/\.?$/, ".")}` : "";
  const frase = TEMA_QUEJA[a.tema];
  // "de el" se contrae en "del" ("se queja del aire acondicionado").
  const deFrase = frase.startsWith("el ") ? `del ${frase.slice(3)}` : `de ${frase}`;
  return `${sujeto} ${deFrase}${reciente}${cita}.${mejora}`;
}
