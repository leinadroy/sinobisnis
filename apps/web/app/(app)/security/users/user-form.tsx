"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser, updateUser } from "./actions";
import { userSchema, type UserValues } from "./schema";

type Props = {
  id?: number;
  initial: UserValues;
  roles: { id: number; name: string }[];
  canEdit: boolean;
};

export function UserForm({ id, initial, roles, canEdit }: Props) {
  const isNew = id === undefined;
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<UserValues>({ resolver: zodResolver(userSchema(isNew)), defaultValues: initial });
  const { errors } = form.formState;
  const roleItems = roles.map((r) => ({ value: String(r.id), label: r.name }));

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = isNew ? await createUser(values) : await updateUser(id!, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(isNew ? "User berhasil dibuat." : "User berhasil diperbarui.");
      router.push("/security/users");
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl">
      <Card>
        <CardContent>
          <fieldset disabled={!canEdit || pending}>
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={!!errors.fullname}>
                <FieldLabel htmlFor="fullname">Fullname</FieldLabel>
                <Input id="fullname" aria-invalid={!!errors.fullname} {...form.register("fullname")} />
                <FieldError errors={[errors.fullname]} />
              </Field>
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input id="username" autoComplete="off" aria-invalid={!!errors.username} {...form.register("username")} />
                <FieldError errors={[errors.username]} />
              </Field>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field data-invalid={!!errors.roleId}>
                <FieldLabel htmlFor="roleId">Role</FieldLabel>
                <Controller control={form.control} name="roleId" render={({ field }) => (
                  <Select items={roleItems} value={field.value || null} onValueChange={(v) => field.onChange(v ?? "")}>
                    <SelectTrigger id="roleId" className="w-full" aria-invalid={!!errors.roleId}>
                      <SelectValue placeholder="Pilih role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleItems.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
                <FieldError errors={[errors.roleId]} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
                {!isNew && <FieldDescription>Kosongkan bila tidak diganti.</FieldDescription>}
                <FieldError errors={[errors.password]} />
              </Field>
              <Field data-invalid={!!errors.retypePassword}>
                <FieldLabel htmlFor="retypePassword">Retype Password</FieldLabel>
                <Input id="retypePassword" type="password" autoComplete="new-password" aria-invalid={!!errors.retypePassword} {...form.register("retypePassword")} />
                <FieldError errors={[errors.retypePassword]} />
              </Field>
              <Field orientation="horizontal">
                <Controller control={form.control} name="isActive" render={({ field }) => (
                  <Checkbox id="isActive" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
                )} />
                <FieldLabel htmlFor="isActive">Is Active</FieldLabel>
              </Field>
            </FieldGroup>
          </fieldset>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background py-3">
        {canEdit && <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Save"}</Button>}
        <Button variant="outline" nativeButton={false} render={<Link href="/security/users" />}>Back To List</Button>
      </div>
    </form>
  );
}
