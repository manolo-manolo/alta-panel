import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { crearSesionToken, passwordCorrecta, cookieOpciones } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const password =
    body && typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  if (!passwordCorrecta(password)) {
    return NextResponse.json(
      { ok: false, error: "Contrasena incorrecta" },
      { status: 401 },
    );
  }

  const token = await crearSesionToken();
  const store = await cookies();
  store.set({ ...cookieOpciones, value: token });
  return NextResponse.json({ ok: true });
}
