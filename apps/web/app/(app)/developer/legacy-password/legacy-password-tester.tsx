"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { LegacyPasswordTestResult } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FORMAT_LABEL: Record<LegacyPasswordTestResult["format"], string> = {
  bcrypt: "bcrypt (aplikasi baru)",
  legacy: "GeneXus lama (SHA-256)",
  unknown: "tidak dikenali",
};

function Verdict({ r }: { r: LegacyPasswordTestResult }) {
  const match = r.format === "legacy" ? r.legacyMatch : r.format === "bcrypt" ? r.bcryptMatch : null;
  let tone = "border-amber-300 bg-amber-50";
  let icon = <MinusCircle className="size-5 text-amber-700" />;
  let text = "Tidak bisa diuji.";
  if (r.format === "legacy" && !r.systemSaltConfigured) {
    icon = <AlertTriangle className="size-5 text-amber-700" />;
    text = "LEGACY_SYSTEM_SALT belum diisi di apps/api/.env — isi lalu restart API.";
  } else if (match === true) {
    tone = "border-green-300 bg-green-50";
    icon = <CheckCircle2 className="size-5 text-green-700" />;
    text = r.format === "legacy" ? "COCOK — rumus GeneXus benar untuk user ini." : "COCOK — password bcrypt benar.";
  } else if (match === false) {
    tone = "border-red-300 bg-red-50";
    icon = <XCircle className="size-5 text-red-700" />;
    text = r.format === "legacy" ? "TIDAK COCOK — password salah, atau rumus/SystemSalt berbeda." : "TIDAK COCOK — password bcrypt salah.";
  } else if (r.format === "unknown") {
    text = "Format password user ini tidak dikenali.";
  }
  return (
    <div className={cn("rounded-md border p-4 text-sm", tone)}>
      <div className="flex items-center gap-2 font-medium">{icon}{text}</div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">User</dt><dd><b>{r.username}</b> (#{r.userId}){r.isActive ? "" : " · nonaktif"}</dd>
        <dt className="text-muted-foreground">Database login</dt><dd>{r.authDatabase}</dd>
        <dt className="text-muted-foreground">Format</dt><dd>{FORMAT_LABEL[r.format]}</dd>
        <dt className="text-muted-foreground">Panjang salt / hash</dt><dd>{r.saltLength} / {r.hashLength} karakter</dd>
        <dt className="text-muted-foreground">SystemSalt</dt><dd>{r.systemSaltConfigured ? "terisi" : "belum diisi"}</dd>
        <dt className="text-muted-foreground">Waktu</dt><dd>{r.ms} ms</dd>
      </dl>
    </div>
  );
}

export function LegacyPasswordTester() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<LegacyPasswordTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return void setError("Isi username dan password.");
    start(async () => {
      setError(null);
      setResult(null);
      const res = await fetch("/bff/dev/legacy-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      }).catch(() => null);
      setPassword(""); // jangan biarkan password tertinggal di form
      if (!res) return void setError("API tidak dapat dihubungi.");
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.message;
        return void setError(Array.isArray(msg) ? msg.join(", ") : msg || `Gagal (HTTP ${res.status}).`);
      }
      setResult(body as LegacyPasswordTestResult);
    });
  };

  return (
    <div className="grid max-w-xl gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate autoComplete="off">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="gx-username">Username</FieldLabel>
                <Input id="gx-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="gx-password">Password (yang dipakai di aplikasi lama)</FieldLabel>
                <Input id="gx-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
              <Button type="submit" disabled={pending}>{pending ? "Menguji…" : "Uji Password"}</Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {result && <Verdict r={result} />}
    </div>
  );
}
