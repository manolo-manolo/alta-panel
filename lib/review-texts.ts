// Textos y notas por categoria de una review, leidos del payload crudo de
// Guesty sin asumir una forma concreta (Airbnb y Booking difieren y el
// envoltorio de Guesty puede variar). Puro y client-safe.

export const CATEGORIAS_REVIEW = [
  "limpieza",
  "exactitud",
  "llegada",
  "comunicacion",
  "ubicacion",
  "valor",
  "comodidad",
  "instalaciones",
] as const;
export type CategoriaReview = (typeof CATEGORIAS_REVIEW)[number];

export const CATEGORIA_REVIEW_LABEL: Record<CategoriaReview, string> = {
  limpieza: "Limpieza",
  exactitud: "Fiel al anuncio",
  llegada: "Llegada",
  comunicacion: "Comunicación",
  ubicacion: "Ubicación",
  valor: "Calidad-precio",
  comodidad: "Comodidad",
  instalaciones: "Instalaciones",
};

// Claves de Airbnb (category_ratings) y Booking (scoring) a nuestras categorias.
const CLAVES: Record<string, CategoriaReview> = {
  cleanliness: "limpieza",
  clean: "limpieza",
  accuracy: "exactitud",
  checkin: "llegada",
  check_in: "llegada",
  communication: "comunicacion",
  staff: "comunicacion",
  location: "ubicacion",
  value: "valor",
  value_for_money: "valor",
  comfort: "comodidad",
  facilities: "instalaciones",
};

export interface TextosReview {
  publica: string | null;
  privada: string | null; // comentario privado al anfitrion (Airbnb)
  positivo: string | null; // Booking: lo que gusto
  negativo: string | null; // Booking: lo que no gusto
  categorias: { categoria: CategoriaReview; nota: number }[]; // escala 0-5
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function nota(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Extrae los textos analizables y las notas por categoria. `content` es el
 * texto publico ya mapeado en el sync; `raw` es la review de Guesty completa.
 */
export function textosReview(content: string | null, raw: unknown, escala: number): TextosReview {
  const rev = obj(raw) ?? {};
  const rr = obj(rev.rawReview) ?? {};
  const cont = obj(rr.content) ?? {};

  const privada = texto(rr.private_feedback) ?? texto(rr.privateFeedback);
  const positivo = texto(cont.positive) ?? texto(rr.positive) ?? texto(rr.pros);
  const negativo = texto(cont.negative) ?? texto(rr.negative) ?? texto(rr.cons);
  let publica = texto(content);
  // En Booking el texto publico puede ser la union de positivo y negativo: no
  // se repite si coincide con uno de ellos.
  if (publica && (publica === positivo || publica === negativo)) publica = null;

  const notas = new Map<CategoriaReview, number>();
  const factor = escala === 10 ? 0.5 : 1;
  const ratings = rr.category_ratings ?? rr.categoryRatings;
  if (Array.isArray(ratings)) {
    for (const it of ratings) {
      const o = obj(it);
      if (!o) continue;
      const cat = CLAVES[String(o.category ?? o.name ?? "").toLowerCase()];
      const n = nota(o.rating ?? o.score ?? o.value);
      if (cat && n !== null) notas.set(cat, n * factor);
    }
  } else if (obj(ratings)) {
    for (const [k, v] of Object.entries(obj(ratings)!)) {
      const cat = CLAVES[k.toLowerCase()];
      const n = nota(v);
      if (cat && n !== null) notas.set(cat, n * factor);
    }
  }
  const scoring = obj(rr.scoring) ?? obj(rr.scores);
  if (scoring) {
    for (const [k, v] of Object.entries(scoring)) {
      const cat = CLAVES[k.toLowerCase()];
      const n = nota(v);
      if (cat && n !== null && !notas.has(cat)) notas.set(cat, n * factor);
    }
  }

  return {
    publica,
    privada,
    positivo,
    negativo,
    categorias: [...notas.entries()]
      .filter(([, n]) => n <= 5)
      .map(([categoria, n]) => ({ categoria, nota: n })),
  };
}

/** True si la review tiene algun texto que traducir o analizar. */
export function tieneTexto(t: TextosReview): boolean {
  return !!(t.publica || t.privada || t.positivo || t.negativo);
}
