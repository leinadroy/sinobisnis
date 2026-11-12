import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { LoginResponse } from "@sml/shared";
import { API_URL, TOKEN_COOKIE } from "@/lib/api";
import { loginSchema } from "../schema";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Username dan password wajib diisi." }, { status: 400 });

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "API tidak dapat dihubungi." }, { status: 503 });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    return NextResponse.json({ message: Array.isArray(message) ? message.join(" ") : message || "Login gagal." }, { status: response.status });
  }

  const { accessToken, expiresIn } = body as LoginResponse;
  (await cookies()).set(TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresIn,
  });
  return NextResponse.json({ ok: true });
}
