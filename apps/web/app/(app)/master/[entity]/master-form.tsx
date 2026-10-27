"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import type { MasterEntity, MasterField, MasterOptions } from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveMaster } from "./actions";

type Values = Record<string, string | boolean>;

/** Skema zod dibangun dari definisi field master (wajib, angka). */
function schemaFor(fields: MasterField[]) {
  return z.object(Object.fromEntries(fields.map((f) => {
    if (f.type === "checkbox") return [f.name, z.boolean()];
    let s = z.string();
    if (f.required) s = s.trim().min(1, `${f.label} wajib diisi.`);
    if (f.type === "number") return [f.name, s.refine((v) => v === "" || !Number.isNaN(Number(v)), `${f.label} harus angka.`)];
    return [f.name, s];
  })));
}

export function MasterForm({ entity, id, initial, options, canEdit }: {
  entity: MasterEntity; id?: number; initial: Values; options: MasterOptions; canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const schema = useMemo(() => schemaFor(entity.fields), [entity]);
  // Skema dibangun saat runtime dari definisi entitas, jadi tipe resolver di-cast ke bentuk nilai form.
  const form = useForm<Values>({ resolver: zodResolver(schema) as unknown as Resolver<Values>, defaultValues: initial });
  const { errors } = form.formState;

  const refItems = (f: MasterField) => {
    const src = f.ref === "sponsors" ? options.sponsors.map((s) => ({ id: s.id, label: s.name })) : f.ref === "billTos" ? options.billTos : options.bankAccounts;
    return src.map((o) => ({ value: String(o.id), label: o.label }));
  };

  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await saveMaster(entity.slug, id ?? null, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${entity.title} berhasil disimpan.`);
      router.push(`/master/${entity.slug}`);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-4xl">
      <Card>
        <CardContent>
          <fieldset disabled={!canEdit || pending}>
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              {entity.fields.map((f) => {
                const err = errors[f.name];
                const wide = f.type === "textarea";
                return (
                  <Field key={f.name} data-invalid={!!err} orientation={f.type === "checkbox" ? "horizontal" : undefined} className={wide ? "md:col-span-2" : ""}>
                    {f.type === "checkbox" ? (
                      <>
                        <Controller control={form.control} name={f.name} render={({ field }) => (
                          <Checkbox id={f.name} checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v)} />
                        )} />
                        <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
                      </>
                    ) : (
                      <>
                        <FieldLabel htmlFor={f.name}>{f.label}{f.required && <span className="text-destructive">*</span>}</FieldLabel>
                        {f.type === "textarea" ? (
                          <Textarea id={f.name} rows={4} {...form.register(f.name)} />
                        ) : f.type === "select" || f.type === "ref" ? (
                          <Controller control={form.control} name={f.name} render={({ field }) => {
                            const items = f.type === "ref" ? [{ value: "", label: "— kosong —" }, ...refItems(f)] : (f.options ?? []).map((o) => ({ value: o, label: o }));
                            return (
                              <Select items={items} value={String(field.value ?? "")} onValueChange={(v) => field.onChange(v ?? "")}>
                                <SelectTrigger id={f.name} className="w-full" aria-invalid={!!err}><SelectValue placeholder="== Please Select ==" /></SelectTrigger>
                                <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                              </Select>
                            );
                          }} />
                        ) : (
                          <Input id={f.name} type={f.type === "number" ? "number" : "text"} step="any" aria-invalid={!!err} {...form.register(f.name)} />
                        )}
                        {f.help && <FieldDescription>{f.help}</FieldDescription>}
                        <FieldError errors={[err as { message?: string } | undefined]} />
                      </>
                    )}
                  </Field>
                );
              })}
            </FieldGroup>
          </fieldset>
        </CardContent>
      </Card>
      <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background py-3">
        {canEdit && <Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Save"}</Button>}
        <Button variant="outline" nativeButton={false} render={<Link href={`/master/${entity.slug}`} />}>Back To List</Button>
      </div>
    </form>
  );
}
