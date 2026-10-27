"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { LoginResponse } from "@sml/shared";
import { apiFetch, runAction, TOKEN_COOKIE } from "@/lib/api";
import { loginSchema, type LoginValues } from "./schema";

export async function login(values: LoginValues, next?: string) {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { ok: false as const, error: "Username dan password wajib diisi." };

  const res = await runAction(() => apiFetch<LoginResponse>("/auth/login", { method: "POST", json: parsed.data, auth: false }));
  if (!res.ok) return res;

  (await cookies()).set(TOKEN_COOKIE, res.data!.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: res.data!.expiresIn,
  });
  // Hanya izinkan redirect internal.
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
