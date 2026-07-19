import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarSesionToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/config";

/** True si la peticion actual tiene una sesion valida. */
export async function sesionActiva(): Promise<boolean> {
  const store = await cookies();
  return verificarSesionToken(store.get(COOKIE_SESION)?.value);
}

/** Exige sesion en un Server Component; si no la hay, redirige a /login. */
export async function requireSesion(): Promise<void> {
  if (!(await sesionActiva())) redirect("/login");
}
