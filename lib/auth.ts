/**
 * Sesion v1: cookie firmada con HMAC-SHA256 (contrasena compartida).
 *
 * Diseno aislado para poder migrar mas adelante a logins por usuario (Auth.js)
 * sin tocar el resto de la app: basta con reemplazar crear/verificar sesion y
 * el endpoint de login.
 *
 * Sin dependencias de Node especificas: usa Web Crypto (crypto.subtle), valido
 * tanto en el runtime del proxy como en route handlers.
 */

import { COOKIE_SESION, SESION_DIAS } from "@/lib/config";

const enc = new TextEncoder();

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.trim() === "") {
    throw new Error("Falta SESSION_SECRET.");
  }
  return s;
}

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlFromString(str: string): string {
  return b64urlFromBytes(enc.encode(str));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlFromBytes(new Uint8Array(sig));
}

/** Comparacion en tiempo (casi) constante para evitar fugas por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Payload {
  exp: number; // epoch segundos
}

/** Crea un token de sesion valido `dias` dias. */
export async function crearSesionToken(dias = SESION_DIAS): Promise<string> {
  const payload: Payload = {
    exp: Math.floor(Date.now() / 1000) + dias * 24 * 60 * 60,
  };
  const body = b64urlFromString(JSON.stringify(payload));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

/** Verifica firma y expiracion de un token de sesion. */
export async function verificarSesionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  let esperado: string;
  try {
    esperado = await hmac(body);
  } catch {
    return false;
  }
  if (!safeEqual(sig, esperado)) return false;
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Payload;
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/** Compara la contrasena introducida con DASHBOARD_PASSWORD. */
export function passwordCorrecta(intento: string): boolean {
  const real = process.env.DASHBOARD_PASSWORD ?? "";
  if (real === "") return false;
  return safeEqual(intento, real);
}

export const cookieOpciones = {
  name: COOKIE_SESION,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESION_DIAS * 24 * 60 * 60,
};
