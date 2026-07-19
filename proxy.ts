import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/config";

/**
 * Gate de acceso (antes "middleware", ahora "proxy" en Next 16).
 * Protege todas las rutas salvo:
 *  - /login y el endpoint de login
 *  - /api/sync (protegido aparte por CRON_SECRET o sesion, en el propio handler)
 *  - assets estaticos (_next, favicon, etc. ya excluidos por el matcher)
 */

const PUBLICAS = ["/login", "/api/auth/login"];

function esPublica(pathname: string): boolean {
  if (PUBLICAS.includes(pathname)) return true;
  // El cron llama a /api/sync con su propio secreto; el handler valida.
  if (pathname === "/api/sync") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_SESION)?.value;
  const autenticado = await verificarSesionToken(token);

  if (esPublica(pathname)) {
    // Si ya esta autenticado y va a /login, mandarlo al panel.
    if (autenticado && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (autenticado) return NextResponse.next();

  // No autenticado: API responde 401; paginas redirigen a /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Ejecuta en todo salvo estaticos y metadatos.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
