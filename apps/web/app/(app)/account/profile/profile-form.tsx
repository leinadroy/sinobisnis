"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateProfile } from "../actions";

export function ProfileForm({ username, roleName, fullname, email }: { username: string; roleName: string; fullname: string; email: string }) {
  const [values, setValues] = useState({ fullname, email });
  const [pending, start] = useTransition();
  return (
    <Card className="max-w-xl">
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await updateProfile(values);
              if (res.ok) toast.success("Profil diperbarui."); else toast.error(res.error);
            });
          }}
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field><FieldLabel htmlFor="u">Username</FieldLabel><Input id="u" value={username} readOnly disabled /></Field>
            <Field><FieldLabel htmlFor="r">Role</FieldLabel><Input id="r" value={roleName} readOnly disabled /></Field>
            <Field>
              <FieldLabel htmlFor="fullname">Fullname</FieldLabel>
              <Input id="fullname" value={values.fullname} onChange={(e) => setValues((v) => ({ ...v, fullname: e.target.value }))} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
            </Field>
          </FieldGroup>
          <Button type="submit" className="mt-5" disabled={pending}>{pending ? "Menyimpan…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
