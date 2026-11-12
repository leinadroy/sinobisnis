"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginValues } from "./schema";

export function LoginForm({ next, expired }: { next?: string; expired?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(expired ? "Sesi login sudah berakhir. Silakan login kembali." : null);
  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { username: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/login/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(result.message || "Login gagal.");
          return;
        }
        window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      } catch {
        setError("Server tidak dapat dihubungi. Silakan coba lagi.");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Field data-invalid={!!errors.username}>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" autoComplete="username" autoFocus aria-invalid={!!errors.username} {...form.register("username")} />
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
          <FieldError errors={[errors.password]} />
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Memproses…" : "Login"}
        </Button>
      </FieldGroup>
    </form>
  );
}
