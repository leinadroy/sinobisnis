"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword } from "../actions";
import { passwordSchema, type PasswordValues } from "../schema";

type Values = PasswordValues;

export function PasswordForm() {
  const [pending, start] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(passwordSchema), defaultValues: { current: "", password: "", confirm: "" } });
  const { errors } = form.formState;
  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const res = await changePassword(v);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Password berhasil diganti.");
      form.reset();
    }),
  );
  const fields: [keyof Values, string, string][] = [
    ["current", "Password Lama", "current-password"],
    ["password", "Password Baru", "new-password"],
    ["confirm", "Konfirmasi Password Baru", "new-password"],
  ];
  return (
    <Card className="max-w-md">
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {fields.map(([name, label, ac]) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={name}>{label}</FieldLabel>
                <Input id={name} type="password" autoComplete={ac} aria-invalid={!!errors[name]} {...form.register(name)} />
                <FieldError errors={[errors[name]]} />
              </Field>
            ))}
            <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Change Password"}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
