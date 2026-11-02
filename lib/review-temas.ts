// Taxonomia fija de temas de reviews. Fija a proposito: permite contar
// menciones entre reviews, unidades y periodos. Puro y client-safe.

export const TEMAS_REVIEW = [
  "limpieza",
  "llegada",
  "comunicacion",
  "ubicacion",
  "ruido",
  "descanso",
  "bano",
  "cocina",
  "climatizacion",
  "wifi",
  "mantenimiento",
  "espacio",
  "exterior",
  "aparcamiento",
  "exactitud",
  "valor",
  "otros",
] as const;
export type TemaReview = (typeof TEMAS_REVIEW)[number];

export const TEMA_LABEL: Record<TemaReview, string> = {
  limpieza: "Limpieza",
  llegada: "Llegada y check-in",
  comunicacion: "Trato y comunicación",
  ubicacion: "Ubicación",
  ruido: "Ruido",
  descanso: "Camas y descanso",
  bano: "Baño y agua caliente",
  cocina: "Cocina y equipamiento",
  climatizacion: "Aire acondicionado y calefacción",
  wifi: "Wifi",
  mantenimiento: "Averías y mantenimiento",
  espacio: "Espacio y comodidad",
  exterior: "Terraza, vistas y luz",
  aparcamiento: "Aparcamiento y acceso",
  exactitud: "Fiel al anuncio",
  valor: "Calidad-precio",
  otros: "Otros",
};

/** Definiciones para el modelo (que cuenta en cada tema). */
export const TEMA_DEFINICION: Record<TemaReview, string> = {
  limpieza: "limpieza del piso, sábanas, toallas, olores",
  llegada: "check-in, instrucciones de acceso, llaves o cerradura, hora de entrada o salida",
  comunicacion: "trato, rapidez y claridad del anfitrión o del equipo",
  ubicacion: "zona, barrio, distancias, transporte",
  ruido: "ruido de la calle, vecinos, obras, aislamiento",
  descanso: "camas, colchones, almohadas, oscuridad del dormitorio",
  bano: "baño, ducha, presión o agua caliente",
  cocina: "cocina, menaje, electrodomésticos, café, básicos",
  climatizacion: "aire acondicionado, calefacción, temperatura",
  wifi: "wifi, internet, espacio para trabajar",
  mantenimiento: "cosas rotas o que no funcionan, desperfectos",
  espacio: "tamaño, distribución, comodidad, decoración",
  exterior: "terraza, balcón, vistas, luz natural",
  aparcamiento: "aparcamiento, ascensor, escaleras, accesibilidad",
  exactitud: "si el piso coincide con las fotos y la descripción del anuncio",
  valor: "relación calidad-precio, precio, tasas",
  otros: "algo concreto que no encaje en ningún tema anterior",
};

/** Como se nombra el tema en una queja: "3 reseñas se quejan de ...". */
export const TEMA_QUEJA: Record<TemaReview, string> = {
  limpieza: "la limpieza",
  llegada: "la llegada o el check-in",
  comunicacion: "el trato o la comunicación",
  ubicacion: "la ubicación",
  ruido: "ruido",
  descanso: "las camas o el descanso",
  bano: "el baño o el agua caliente",
  cocina: "la cocina o el equipamiento",
  climatizacion: "el aire acondicionado o la calefacción",
  wifi: "el wifi",
  mantenimiento: "averías o desperfectos",
  espacio: "el espacio o la comodidad",
  exterior: "la terraza, las vistas o la luz",
  aparcamiento: "el aparcamiento o el acceso",
  exactitud: "diferencias con el anuncio",
  valor: "la relación calidad-precio",
  otros: "otros aspectos",
};
