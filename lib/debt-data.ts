// Prestamos reales por unidad (hoja "Deuda por piso", saldos a 31/08/2026).
// Cuota fija (sistema frances): con saldo de referencia, cuota y tipo se
// reconstruye el calendario completo hacia delante y hacia atras.
// Actualizar aqui cuando se firme o refinancie un prestamo.
// Puro y client-safe.

export interface PrestamoReal {
  /** Palabras clave (normalizadas, sin acentos) para casar con el nombre o nickname de la unidad. */
  claves: string[];
  nombre: string;
  importeInicial: number;
  /** Saldo vivo al cierre de `mesRef`. */
  saldoRef: number;
  mesRef: string; // YYYY-MM
  pagoMensual: number;
  interesAnual: number; // fraccion (0.0499 = 4,99%)
  /** Meses de carencia de principal (solo intereses) desde el inicio. */
  carenciaMeses?: number;
  /** Mes de inicio conocido (obligatorio si el saldoRef aun es el importe inicial). */
  inicioMes?: string; // YYYY-MM
}

export const PRESTAMOS: PrestamoReal[] = [
  {
    claves: ["benalmadena", "mmenapalma"],
    nombre: "Benalmadena",
    importeInicial: 73255.1,
    saldoRef: 54955.35,
    mesRef: "2026-08",
    pagoMensual: 1035.04,
    interesAnual: 0.0499,
  },
  {
    claves: ["igueldo", "pigueldo"],
    nombre: "Igueldo",
    importeInicial: 80801.25,
    saldoRef: 60616.42,
    mesRef: "2026-08",
    pagoMensual: 1141.66,
    interesAnual: 0.0499,
  },
  {
    claves: ["mendiru", "pintorcroldan"],
    nombre: "Mendiru",
    importeInicial: 61719.39,
    saldoRef: 46301.37,
    mesRef: "2026-08",
    pagoMensual: 872.05,
    interesAnual: 0.0499,
  },
  {
    claves: ["sostoa", "heroedesostoa"],
    nombre: "Sostoa",
    importeInicial: 84224.26,
    saldoRef: 63184.33,
    mesRef: "2026-08",
    pagoMensual: 1190.02,
    interesAnual: 0.0499,
  },
  {
    claves: ["alferez"],
    nombre: "Alferez",
    importeInicial: 180000,
    saldoRef: 168832.51,
    mesRef: "2026-08",
    pagoMensual: 1255.2,
    interesAnual: 0.0314,
  },
  {
    claves: ["moreno masson", "morenomasson"],
    nombre: "Moreno Masson",
    importeInicial: 107000,
    saldoRef: 100361.48,
    mesRef: "2026-08",
    pagoMensual: 746.15,
    interesAnual: 0.0314,
  },
  {
    // 3,8652% fijo el primer ano, 2 meses de carencia. Se modela todo el
    // calendario al tipo del primer ano hasta conocer la revision.
    claves: ["paco romo", "pacoromo"],
    nombre: "Paco Romo",
    importeInicial: 182400,
    saldoRef: 182400,
    mesRef: "2026-08",
    pagoMensual: 1348.91,
    interesAnual: 0.038652,
    carenciaMeses: 2,
    inicioMes: "2026-08",
  },
  {
    // Pendiente de firma: se asume identico a Paco Romo (indicacion del
    // propietario) con inicio en septiembre de 2026.
    claves: ["pena"],
    nombre: "Pena",
    importeInicial: 182400,
    saldoRef: 182400,
    mesRef: "2026-09",
    pagoMensual: 1348.91,
    interesAnual: 0.038652,
    carenciaMeses: 2,
    inicioMes: "2026-09",
  },
];
