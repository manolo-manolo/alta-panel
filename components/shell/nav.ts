import {
  Building2,
  CalendarRange,
  Globe,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Settings,
  Upload,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

// Arquitectura de informacion: que hacer hoy, como va el negocio, como crecer
// y la gestion de datos.
export const NAV_GRUPOS: NavGrupo[] = [
  {
    titulo: "Hoy",
    items: [{ href: "/acciones", label: "Acciones", icon: Zap }],
  },
  {
    titulo: "Rendimiento",
    items: [
      { href: "/", label: "Resumen", icon: LayoutDashboard },
      { href: "/unidades", label: "Unidades", icon: Building2 },
      { href: "/pnl", label: "P&L y caja", icon: Landmark },
      { href: "/costes", label: "Costes", icon: Wallet },
    ],
  },
  {
    titulo: "Crecimiento",
    items: [
      { href: "/anuncios", label: "Anuncios", icon: Megaphone },
      { href: "/web", label: "Web", icon: Globe },
      { href: "/estacionalidad", label: "Estacionalidad", icon: CalendarRange },
    ],
  },
  {
    titulo: "Datos",
    items: [
      { href: "/opex", label: "Subir gastos", icon: Upload },
      { href: "/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
];

export const NAV_TODOS: NavItem[] = NAV_GRUPOS.flatMap((g) => g.items);

// Pestanas fijas de la barra inferior en movil (el resto va en "Mas").
export const NAV_MOVIL = ["/", "/acciones", "/unidades", "/pnl"];

export function esActiva(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/unidades") return pathname.startsWith("/unidades") || pathname.startsWith("/unidad/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Conserva mes y periodo al navegar entre secciones. */
export function hrefConContexto(href: string, mes?: string, periodo?: string): string {
  if (!mes) return href;
  return `${href}?mes=${mes}&periodo=${periodo ?? "mes"}`;
}
