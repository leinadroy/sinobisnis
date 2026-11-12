import type { Metadata } from "next";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="flex min-h-svh items-start justify-center bg-slate-500/80 px-4 pt-[12vh]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Image src="/logo-sinobisnis.png" alt="Sinobisnis Mitra Lestari" width={1342} height={267} priority className="h-auto w-full object-contain" />
        </CardHeader>
        <CardContent>
          {sp.db === "switched" && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Database aplikasi sudah diganti. Silakan login ulang.</p>
          )}
          <LoginForm next={next} expired={sp.expired === "1" && sp.db !== "switched"} />
        </CardContent>
      </Card>
    </main>
  );
}
