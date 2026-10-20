// Auditoria de conversion de un anuncio a partir del objeto de Guesty
// (listings.raw) y de datos del panel. Puro y client-safe.
//
// La puntuacion (0-100) pondera lo que mas mueve conversion y ranking en
// Airbnb/Booking: fotos, titulo, descripcion, amenities clave, terminos,
// reviews y coherencia de tarifas. Cada hallazgo es una accion concreta.

import type { Insight } from "@/lib/insights";

export interface AuditoriaInput {
  raw: Record<string, unknown> | null;
  adrTTM: number | null;
  reviewsTotal: number;
  ratingMedio: number | null; // 0-5, historico
  estanciasTTM: number;
  limpiezaCosteTTM: number;
}

export interface Hallazgo extends Insight {
  area: "fotos" | "titulo" | "descripcion" | "amenities" | "terminos" | "reviews" | "tarifas";
}

export interface AuditoriaAnuncio {
  datos: boolean; // el objeto trae contenido (requiere sync con campos ampliados)
  puntuacion: number;
  fotos: number;
  titulo: string | null;
  descripcionLen: number;
  amenities: number;
  faltanAmenities: string[];
  minNoches: number | null;
  maxNoches: number | null;
  cancelacion: string | null;
  precioBase: number | null;
  tarifaLimpieza: number | null;
  costeLimpiezaEstancia: number | null;
  descuentoSemanal: number | null; // fraccion de descuento (0.1 = 10%)
  descuentoMensual: number | null;
  hallazgos: Hallazgo[];
}

const AMENITIES_CLAVE: { nombre: string; patron: RegExp }[] = [
  { nombre: "Wifi", patron: /wifi|wireless internet|\binternet\b/i },
  { nombre: "Aire acondicionado", patron: /air condition|\bac\b|aire acondicionado/i },
  { nombre: "Calefaccion", patron: /heating|calefacci/i },
  { nombre: "Cocina", patron: /kitchen|cocina/i },
  { nombre: "Lavadora", patron: /washer|washing machine|lavadora/i },
  { nombre: "Espacio de trabajo", patron: /workspace|laptop|desk|escritorio/i },
  { nombre: "Self check-in", patron: /self[- ]check|lockbox|smart ?lock|keypad|key ?box|caja de llaves/i },
  { nombre: "TV", patron: /\btv\b|television/i },
  { nombre: "Lavavajillas", patron: /dishwasher|lavavajillas/i },
  { nombre: "Secador", patron: /hair ?dryer|secador/i },
  { nombre: "Cafetera", patron: /coffee|cafetera/i },
  { nombre: "Plancha", patron: /\biron\b|plancha/i },
  { nombre: "Basicos (toallas, sabanas, jabon)", patron: /essentials|basicos/i },
  { nombre: "Ascensor", patron: /elevator|\blift\b|ascensor/i },
];

const PALABRAS_GANCHO = [
  "terraza", "vistas", "centro", "playa", "piscina", "parking", "garaje", "luminoso",
  "balcon", "jardin", "atico", "historico", "mar", "catedral", "soho", "malagueta",
  "terrace", "view", "beach", "pool", "rooftop", "sea",
];

const eur0 = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(n);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function auditarAnuncio(i: AuditoriaInput): AuditoriaAnuncio {
  const raw = i.raw ?? {};
  const pictures = Array.isArray(raw.pictures) ? (raw.pictures as unknown[]) : [];
  const amenitiesRaw = Array.isArray(raw.amenities)
    ? (raw.amenities as unknown[]).map((a) => (typeof a === "string" ? a : String(obj(a).name ?? "")))
    : [];
  const desc = obj(raw.publicDescription);
  const prices = obj(raw.prices);
  const terms = obj(raw.terms);
  const datos = pictures.length > 0 || amenitiesRaw.length > 0 || Object.keys(desc).length > 0;

  const titulo = str(raw.title);
  const partes = ["summary", "space", "access", "neighborhood", "transit", "notes", "houseRules"]
    .map((k) => str(desc[k]) ?? "")
    .filter(Boolean);
  const textoDesc = partes.join("\n");
  const descripcionLen = textoDesc.length;
  const amenitiesTxt = amenitiesRaw.join(" | ");
  const faltanAmenities = AMENITIES_CLAVE.filter((a) => !a.patron.test(amenitiesTxt)).map((a) => a.nombre);
  const minNoches = num(terms.minNights);
  const maxNoches = num(terms.maxNights);
  const cancelacion =
    str(terms.cancellation) ?? str(terms.cancellationPolicy) ?? str(raw.cancellationPolicy);
  const precioBase = num(prices.basePrice);
  const tarifaLimpieza = num(prices.cleaningFee);
  const semanal = num(prices.weeklyPriceFactor);
  const mensual = num(prices.monthlyPriceFactor);
  const descuentoSemanal = semanal !== null ? Math.max(0, 1 - semanal) : null;
  const descuentoMensual = mensual !== null ? Math.max(0, 1 - mensual) : null;
  const costeLimpiezaEstancia =
    i.estanciasTTM > 0 && i.limpiezaCosteTTM > 0 ? i.limpiezaCosteTTM / i.estanciasTTM : null;

  const h: Hallazgo[] = [];
  let puntos = 0;

  if (!datos) {
    return {
      datos: false,
      puntuacion: 0,
      fotos: 0,
      titulo,
      descripcionLen: 0,
      amenities: 0,
      faltanAmenities: [],
      minNoches,
      maxNoches,
      cancelacion,
      precioBase,
      tarifaLimpieza,
      costeLimpiezaEstancia,
      descuentoSemanal,
      descuentoMensual,
      hallazgos: [],
    };
  }

  // Fotos (20)
  const fotos = pictures.length;
  if (fotos >= 25) puntos += 20;
  else if (fotos >= 15) puntos += 14;
  else if (fotos >= 8) puntos += 8;
  if (fotos < 15) {
    h.push({
      tono: fotos < 8 ? "alerta" : "info",
      area: "fotos",
      texto: `${fotos} fotos. Los anuncios que mejor convierten llevan 25-35: anade exteriores, zona, detalles (cafetera, cama hecha, bano) y una foto con luz natural de cada estancia. Primera foto = la mejor vista o estancia principal.`,
    });
  }
  const sinCaption = pictures.filter((p) => !str(obj(p).caption)).length;
  if (fotos > 0 && sinCaption > fotos * 0.5) {
    h.push({
      tono: "info",
      area: "fotos",
      texto: `${sinCaption} de ${fotos} fotos sin pie de foto: Airbnb los indexa y ayudan a convertir ("Dormitorio principal, cama 160, aire acondicionado").`,
    });
  }

  // Titulo (10)
  if (titulo) {
    const len = titulo.length;
    const mayusculas = titulo === titulo.toUpperCase() && /[A-Z]/.test(titulo);
    const gancho = PALABRAS_GANCHO.some((p) => titulo.toLowerCase().includes(p));
    if (len >= 25 && len <= 55 && !mayusculas && gancho) puntos += 10;
    else if (len >= 15 && len <= 65 && !mayusculas) puntos += 6;
    else puntos += 2;
    if (len > 55) {
      h.push({ tono: "info", area: "titulo", texto: `Titulo de ${len} caracteres: Airbnb lo corta en movil hacia los 50. Deja el gancho al principio ("Atico con terraza y vistas al mar, centro").` });
    } else if (len < 20) {
      h.push({ tono: "info", area: "titulo", texto: `Titulo de ${len} caracteres: aprovecha hasta 50 con el mejor gancho (vistas, terraza, zona, parking) y el tipo de alojamiento.` });
    }
    if (!gancho) {
      h.push({ tono: "info", area: "titulo", texto: `El titulo no vende nada concreto: mete el atributo que decide ("terraza", "vistas", "junto a la playa", "parking", "centro historico").` });
    }
    if (mayusculas) {
      h.push({ tono: "info", area: "titulo", texto: "Titulo en mayusculas: penaliza la lectura y parece spam. Usa capitalizacion normal." });
    }
  } else {
    h.push({ tono: "alerta", area: "titulo", texto: "Sin titulo en el anuncio." });
  }

  // Descripcion (15)
  if (descripcionLen >= 900) puntos += 15;
  else if (descripcionLen >= 450) puntos += 9;
  else if (descripcionLen > 0) puntos += 3;
  if (descripcionLen < 450) {
    h.push({
      tono: descripcionLen < 150 ? "alerta" : "info",
      area: "descripcion",
      texto: `Descripcion de ${descripcionLen} caracteres. Las que convierten superan los 900 y responden a: para quien es, que tiene cada estancia, como se llega (self check-in), que hay a 5 minutos andando y normas claras.`,
    });
  }
  const NOMBRE_SECCION: Record<string, string> = {
    space: "El espacio",
    access: "Acceso de huespedes",
    neighborhood: "El barrio",
  };
  const secciones = ["space", "access", "neighborhood"].filter((k) => !str(desc[k]));
  if (datos && secciones.length > 0) {
    h.push({
      tono: "info",
      area: "descripcion",
      texto: `Faltan secciones en Guesty: ${secciones.map((s) => NOMBRE_SECCION[s]).join(", ")}. Airbnb las muestra como bloques separados y mejoran ranking y conversion.`,
    });
  }
  if (!/licen|vut|registro|vft|cr\/|vt-|\bL\d{2,}/i.test(textoDesc)) {
    h.push({
      tono: "alerta",
      area: "descripcion",
      texto: "No aparece el numero de licencia turistica en la descripcion: obligatorio en Andalucia y las plataformas lo exigen (y lo usan para no ocultar el anuncio).",
    });
  }
  if (!/wifi|wi-fi|fibra|mbps/i.test(textoDesc)) {
    h.push({ tono: "info", area: "descripcion", texto: "Menciona el wifi (velocidad en Mbps) y el espacio de trabajo: es el filtro mas usado por nomadas y estancias de semana." });
  }

  // Amenities clave (25)
  const presentes = AMENITIES_CLAVE.length - faltanAmenities.length;
  puntos += Math.round((presentes / AMENITIES_CLAVE.length) * 25);
  if (faltanAmenities.length > 0) {
    const importantes = faltanAmenities.filter((a) =>
      ["Wifi", "Aire acondicionado", "Cocina", "Lavadora", "Self check-in", "Espacio de trabajo"].includes(a),
    );
    h.push({
      tono: importantes.length > 0 ? "alerta" : "info",
      area: "amenities",
      texto: `Amenities sin marcar: ${faltanAmenities.join(", ")}. Si el piso las tiene, marcarlas es gratis y filtra busquedas (Airbnb no te muestra si el huesped filtra por ellas).`,
    });
  }

  // Terminos (10)
  if (minNoches === null || minNoches <= 2) puntos += 10;
  else if (minNoches === 3) puntos += 6;
  else puntos += 2;
  if (minNoches !== null && minNoches >= 3) {
    h.push({
      tono: "info",
      area: "terminos",
      texto: `Estancia minima de ${minNoches} noches: cierra el paso a escapadas y huecos. Usa minimo 2 en temporada alta y 1 noche en huecos (reglas de estancia por fecha en PriceLabs o Guesty).`,
    });
  }
  if (cancelacion && /strict|estricta|super_strict/i.test(cancelacion)) {
    h.push({
      tono: "info",
      area: "terminos",
      texto: `Politica de cancelacion "${cancelacion}": las flexibles/moderadas convierten mejor y Airbnb las favorece en ranking; compensa con precio no reembolsable con descuento.`,
    });
  }

  // Reviews (10)
  if (i.reviewsTotal >= 30 && (i.ratingMedio ?? 0) >= 4.8) puntos += 10;
  else if (i.reviewsTotal >= 10 && (i.ratingMedio ?? 0) >= 4.6) puntos += 6;
  else if (i.reviewsTotal > 0) puntos += 3;
  if (i.reviewsTotal < 10) {
    h.push({
      tono: "info",
      area: "reviews",
      texto: `${i.reviewsTotal} reviews en total: por debajo de 10 el anuncio compite en desventaja. Pide la valoracion con un mensaje al checkout y ofrece algo a cambio (guia de la zona, late checkout cuando se pueda).`,
    });
  }

  // Tarifas (10)
  if (tarifaLimpieza !== null && costeLimpiezaEstancia !== null) {
    if (tarifaLimpieza >= costeLimpiezaEstancia * 0.95) puntos += 10;
    else {
      puntos += 3;
      h.push({
        tono: "alerta",
        area: "tarifas",
        texto: `Tarifa de limpieza ${eur0(tarifaLimpieza)} vs coste real por estancia ${eur0(costeLimpiezaEstancia)}: pierdes ${eur0(costeLimpiezaEstancia - tarifaLimpieza)} en cada reserva. Subela al coste (o ligeramente por debajo y recuperalo en la tarifa por noche).`,
      });
    }
  } else {
    puntos += 5;
  }
  if (descuentoSemanal !== null && descuentoMensual !== null && descuentoSemanal === 0 && descuentoMensual === 0) {
    h.push({
      tono: "info",
      area: "tarifas",
      texto: "Sin descuento semanal ni mensual: en baja temporada un 5-10% semanal y 15-25% mensual rellena noches entre semana y reduce limpiezas (mas margen por noche).",
    });
  }
  if (precioBase !== null && i.adrTTM !== null && precioBase > i.adrTTM * 1.6) {
    h.push({
      tono: "info",
      area: "tarifas",
      texto: `Precio base en Guesty (${eur0(precioBase)}) muy por encima del ADR real (${eur0(i.adrTTM)}): si no hay pricing dinamico activo en todas las fechas, las fechas sin regla salen caras y no se venden.`,
    });
  }

  const orden = { alerta: 0, info: 1, bueno: 2 } as const;
  h.sort((a, b) => orden[a.tono] - orden[b.tono]);

  return {
    datos: true,
    puntuacion: Math.max(0, Math.min(100, puntos)),
    fotos,
    titulo,
    descripcionLen,
    amenities: presentes,
    faltanAmenities,
    minNoches,
    maxNoches,
    cancelacion,
    precioBase,
    tarifaLimpieza,
    costeLimpiezaEstancia,
    descuentoSemanal,
    descuentoMensual,
    hallazgos: h,
  };
}
