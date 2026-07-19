import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieOpciones } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  store.set({ ...cookieOpciones, value: "", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
