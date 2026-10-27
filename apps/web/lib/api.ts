import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** URL API NestJS (server ke server). Next.js tidak pernah mengakses database langsung. */
export const API_URL = process.env.API_URL ?? "http://localhost:4000/api";
export const TOKEN_COOKIE = "sml_token";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type ApiInit = Omit<RequestInit, "body"> & { json?: unknown; auth?: boolean };

/**
 * Panggil API dengan token dari cookie httpOnly.
 * 401 → arahkan ke login; error lain → ApiError berisi pesan dari API (sudah dalam bahasa Indonesia).
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, auth = true, headers, ...rest } = init;
  const token = auth ? (await cookies()).get(TOKEN_COOKIE)?.value : undefined;
  if (auth && !token) redirect("/login");

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    cache: "no-store",
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  }).catch(() => {
    throw new ApiError(503, "API tidak dapat dihubungi. Pastikan apps/api sedang berjalan.");
  });

  if (res.status === 401 && auth) redirect("/login?expired=1");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message;
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(" ") : msg || `Permintaan gagal (${res.status}).`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/** Bungkus panggilan API di Server Action: ApiError jadi pesan untuk UI, redirect tetap diteruskan. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    throw e;
  }
}
