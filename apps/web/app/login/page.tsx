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
          <Image src="/logo.svg" alt="Sinobisnis Mitra Lestari" width={300} height={60} priority className="h-auto w-full" />
        </CardHeader>
        <CardContent>
          <LoginForm next={next} expired={sp.expired === "1"} />
        </CardContent>
      </Card>
    </main>
  );
}
