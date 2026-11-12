import type { Metadata } from "next";
import { getMe } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

/** Dashboard awal setelah login: sengaja kosong (hanya sapaan); navigasi lewat sidebar. */
export default async function HomePage() {
  const { user } = await getMe();
  return (
    <div>
      <h1 className="text-2xl font-bold italic text-slate-600 md:text-3xl">Hi, kamu login sebagai : {user.fullname}</h1>
      <p className="mt-1 text-muted-foreground">Role yang digunakan : {user.roleName ?? "-"}</p>
    </div>
  );
}
