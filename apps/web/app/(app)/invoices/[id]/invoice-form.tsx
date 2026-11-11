"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Files, Lock, LockOpen, Plus, Printer, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  computeInvoiceTotals, INVOICE_STATUSES, terbilang, todayStr,
  type InvoiceDetail, type InvoiceGroupClientRow, type InvoiceInput, type InvoiceStatus, type MasterOptions, type PriceListItem,
} from "@sml/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/confirm-delete";
import { fmtMoney } from "@/lib/format";
import { deleteInvoice, fetchPriceList, saveInvoice } from "../actions";
import { ClientPicker } from "./client-picker";
import { RequestActions } from "./request-panel";

// Angka disimpan sebagai string selama diketik supaya input kosong / "0," tidak langsung berubah.
type ItemState = { key: number; description: string; keperluanId: number | null; qty: string; unitPrice: string };
type GroupState = { key: number; clients: InvoiceGroupClientRow[]; items: ItemState[] };
type TaxState = { key: number; taxId: string; description: string; value: string };
type Header = {
  no: string; companyId: string; sponsorId: string; billToId: string; npwp: string; date: string; paidDate: string;
  status: InvoiceStatus; information: string; bankAccountId: string;
};
type State = { header: Header; groups: GroupState[]; taxes: TaxState[] };

let seq = 0;
const nextKey = () => ++seq;
const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));
const num = (s: string) => Number(s.replace(",", ".")) || 0;
const newItem = (): ItemState => ({ key: nextKey(), description: "", keperluanId: null, qty: "1", unitPrice: "0" });

function fromDetail(d: InvoiceDetail): State {
  return {
    header: {
      no: str(d.no), companyId: str(d.companyId), sponsorId: str(d.sponsorId), billToId: str(d.billToId), npwp: str(d.npwp),
      date: str(d.date), paidDate: str(d.paidDate), status: d.status, information: str(d.information), bankAccountId: str(d.bankAccountId),
    },
    groups: d.groups.map((g) => ({
      key: nextKey(),
      clients: g.clients,
      items: g.items.map((it) => ({ key: nextKey(), description: it.description, keperluanId: it.keperluanId, qty: str(it.qty), unitPrice: str(it.unitPrice) })),
    })),
    taxes: d.taxes.map((t) => ({ key: nextKey(), taxId: str(t.taxId), description: t.description, value: str(t.value) })),
  };
}

function toInput(s: State): InvoiceInput {
  const h = s.header;
  const id = (v: string) => (v ? Number(v) : null);
  return {
    no: h.no.trim() || null, companyId: id(h.companyId), sponsorId: id(h.sponsorId), billToId: id(h.billToId), npwp: h.npwp.trim() || null,
    date: h.date || null, paidDate: h.status === "PAID" ? h.paidDate || null : null, status: h.status, information: h.information || null,
    bankAccountId: id(h.bankAccountId),
    groups: s.groups.map((g) => ({
      clients: g.clients.map((c) => ({ clientId: c.id, name: c.name })),
      items: g.items.map((it) => ({ description: it.description, keperluanId: it.keperluanId, qty: num(it.qty), unitPrice: num(it.unitPrice) })),
    })),
    taxes: s.taxes.map((t) => ({ taxId: id(t.taxId), description: t.description, value: num(t.value) })),
  };
}

type Props = {
  detail: InvoiceDetail;
  options: MasterOptions;
  priceList: PriceListItem[];
  canEdit: boolean;
  canApprove: boolean;
};

export function InvoiceForm({ detail, options, priceList: initialPrices, canEdit, canApprove }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [s, setS] = useState<State>(() => fromDetail(detail));
  const [prices, setPrices] = useState(initialPrices);
  const [picker, setPicker] = useState<number | null>(null);
  const editable = detail.editable && canEdit;
  const h = s.header;

  const setHeader = (patch: Partial<Header>) => setS((x) => ({ ...x, header: { ...x.header, ...patch } }));
  const setGroup = (key: number, fn: (g: GroupState) => GroupState) => setS((x) => ({ ...x, groups: x.groups.map((g) => (g.key === key ? fn(g) : g)) }));
  const setItem = (gKey: number, iKey: number, patch: Partial<ItemState>) =>
    setGroup(gKey, (g) => ({ ...g, items: g.items.map((it) => (it.key === iKey ? { ...it, ...patch } : it)) }));
  const setTax = (key: number, patch: Partial<TaxState>) => setS((x) => ({ ...x, taxes: x.taxes.map((t) => (t.key === key ? { ...t, ...patch } : t)) }));

  // Daftar harga Kontrak mengikuti Bill To & tanggal invoice.
  const loadPrices = (billToId: string, date: string) => {
    if (!billToId) return setPrices([]);
    fetchPriceList(Number(billToId), date || null).then((r) => r.ok && setPrices(r.data!));
  };

  const onBillTo = (v: string) => {
    const prevNpwp = options.billTos.find((b) => String(b.id) === h.billToId)?.npwp ?? "";
    const npwp = options.billTos.find((b) => String(b.id) === v)?.npwp ?? "";
    setHeader({ billToId: v, ...(!h.npwp || h.npwp === prevNpwp ? { npwp } : {}) });
    if (v !== h.billToId) loadPrices(v, h.date);
  };
  const onCompany = (v: string) => {
    const bank = options.companies.find((c) => String(c.id) === v)?.bankAccountId;
    setHeader({ companyId: v, ...(!h.bankAccountId && bank ? { bankAccountId: String(bank) } : {}) });
  };
  const onDescription = (gKey: number, iKey: number, description: string) => {
    const p = prices.find((x) => x.description.toLowerCase() === description.trim().toLowerCase());
    setItem(gKey, iKey, p ? { description: p.description, keperluanId: p.keperluanId, unitPrice: String(p.price) } : { description });
  };

  const totals = computeInvoiceTotals(
    s.groups.map((g) => ({ items: g.items.map((it) => ({ qty: num(it.qty), unitPrice: num(it.unitPrice) })) })),
    s.taxes.map((t) => ({ taxId: t.taxId ? Number(t.taxId) : null, value: num(t.value) })),
    options.taxes,
  );
  const inForm = new Set(s.groups.flatMap((g) => g.clients.map((c) => c.id)).filter((x): x is number => x !== null));

  const save = () => start(async () => {
    const res = await saveInvoice(detail.id, toInput(s));
    if (!res.ok) return void toast.error(res.error);
    setS(fromDetail(res.data!));
    toast.success(res.data!.editable ? "Invoice berhasil disimpan." : `Invoice disimpan dan terkunci (${res.data!.status}).`);
    router.refresh();
  });

  const sel = (id: keyof Header, label: string, items: { value: string; label: string }[], onChange: (v: string) => void, opts: { required?: boolean; empty?: boolean } = {}) => {
    const all = opts.empty === false ? items : [{ value: "", label: "— kosong —" }, ...items];
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}{opts.required && <span className="text-destructive">*</span>}</FieldLabel>
        <SearchSelect items={all} value={h[id]} onValueChange={(v) => onChange(v ?? "")} id={id} className="w-full" placeholder="== Please Select ==" />
      </Field>
    );
  };
  const lastReq = detail.requests[0];

  return (
    <div className="space-y-4">
      {!detail.editable ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <p>
            Invoice berstatus <b>{detail.status}</b> dan terkunci.{" "}
            {lastReq?.status === "PENDING"
              ? <>Request edit dari <b>{lastReq.requestedBy}</b> sedang menunggu persetujuan.</>
              : <>Gunakan <b>Request To Edit</b> untuk meminta izin perubahan.</>}
          </p>
        </div>
      ) : detail.requestStatus === "APPROVED" && (
        <div className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <LockOpen className="mt-0.5 size-4 shrink-0" />
          <p>Request edit disetujui — invoice bisa diubah <b>satu kali</b>, lalu terkunci lagi setelah disimpan.</p>
        </div>
      )}

      <fieldset disabled={!editable || pending} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Invoice</CardTitle></CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="no">Invoice No</FieldLabel>
                <Input id="no" value={h.no} onChange={(e) => setHeader({ no: e.target.value })} />
              </Field>
              {sel("companyId", "Company", options.companies.map((c) => ({ value: String(c.id), label: c.name })), onCompany)}
              {sel("sponsorId", "Sponsor", options.sponsors.map((x) => ({ value: String(x.id), label: x.name })), (v) => setHeader({ sponsorId: v }))}
              {sel("billToId", "Bill To", options.billTos.map((b) => ({ value: String(b.id), label: b.label })), onBillTo)}
              <Field>
                <FieldLabel htmlFor="npwp">Invoice NPWP</FieldLabel>
                <Input id="npwp" value={h.npwp} onChange={(e) => setHeader({ npwp: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="date">Invoice Date</FieldLabel>
                <DateInput id="date" value={h.date} onChange={(x) => { setHeader({ date: x }); loadPrices(h.billToId, x); }} />
              </Field>
              {sel("status", "Invoice Status", INVOICE_STATUSES.map((x) => ({ value: x, label: x })),
                (v) => setHeader({ status: (v || "DRAFT") as InvoiceStatus, ...(v === "PAID" && !h.paidDate ? { paidDate: todayStr() } : {}) }), { empty: false })}
              <Field>
                <FieldLabel htmlFor="paidDate">Invoice Paid Date</FieldLabel>
                <DateInput id="paidDate" value={h.status === "PAID" ? h.paidDate : ""} disabled={h.status !== "PAID"} onChange={(x) => setHeader({ paidDate: x })} />
                {h.status !== "PAID" && <FieldDescription>Terisi saat status PAID.</FieldDescription>}
              </Field>
              {sel("bankAccountId", "Bank Account", options.bankAccounts.map((b) => ({ value: String(b.id), label: b.label })), (v) => setHeader({ bankAccountId: v }))}
              <Field className="sm:col-span-2 lg:col-span-3">
                <FieldLabel htmlFor="information">Additional Information</FieldLabel>
                <Textarea id="information" rows={3} value={h.information} onChange={(e) => setHeader({ information: e.target.value })} />
                <FieldDescription>Tampil sebagai &quot;Important Information&quot; di cetakan.</FieldDescription>
              </Field>
            </FieldGroup>
            {h.status !== "DRAFT" && editable && (
              <p className="mt-3 text-xs text-muted-foreground">Setelah disimpan dengan status {h.status}, invoice terkunci dan perubahan berikutnya butuh Request To Edit.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detail</CardTitle>
            <p className="text-sm text-muted-foreground">
              Satu <b>grup</b> = sekelompok client yang ditagih dengan layanan yang sama. Ketik atau pilih nama layanan dari daftar harga{" "}
              <Link href="/kontrak" className="text-primary hover:underline">Kontrak</Link> Bill To
              {h.billToId && !prices.length && " (Bill To ini belum punya kontrak yang berlaku)"}; harga terisi otomatis.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <datalist id="svc-list">
              {prices.map((p) => <option key={p.description} value={p.description}>{[p.duration, `Rp ${fmtMoney(p.price)}`].filter(Boolean).join(" · ")}</option>)}
            </datalist>
            {s.groups.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada grup.</p>}
            {s.groups.map((g, gi) => (
              <div key={g.key} className="rounded-lg border">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                  <b className="text-sm">No {gi + 1}</b>
                  {editable && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setS((x) => ({ ...x, groups: x.groups.filter((y) => y.key !== g.key) }))}>
                      <Trash2 /> Hapus grup
                    </Button>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="hidden grid-cols-[minmax(0,1fr)_6rem_10rem_10rem_2rem] gap-2 text-xs font-medium text-muted-foreground md:grid">
                    <span>Description</span><span>Pax</span><span>Price Per Pax</span><span className="text-right">Total Price</span><span />
                  </div>
                  {g.items.map((it) => (
                    <div key={it.key} className="grid grid-cols-2 gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,1fr)_6rem_10rem_10rem_2rem] md:items-center md:rounded-none md:border-0 md:p-0">
                      <Input className="col-span-2 md:col-span-1" aria-label="Description" list="svc-list" autoComplete="off" placeholder="Nama layanan"
                        value={it.description} onChange={(e) => onDescription(g.key, it.key, e.target.value)} />
                      <Input aria-label="Pax" inputMode="decimal" value={it.qty} onChange={(e) => setItem(g.key, it.key, { qty: e.target.value })} />
                      <Input aria-label="Price Per Pax" inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(g.key, it.key, { unitPrice: e.target.value })} />
                      <span className="self-center text-right text-sm tabular-nums">{fmtMoney(Math.round(num(it.qty) * num(it.unitPrice) * 100) / 100)}</span>
                      {editable ? (
                        <Button variant="ghost" size="icon-sm" aria-label="Hapus item" className="justify-self-end text-destructive"
                          onClick={() => setGroup(g.key, (x) => ({ ...x, items: x.items.filter((y) => y.key !== it.key) }))}><X /></Button>
                      ) : <span />}
                    </div>
                  ))}
                  {editable && <Button variant="outline" size="sm" onClick={() => setGroup(g.key, (x) => ({ ...x, items: [...x.items, newItem()] }))}><Plus /> Add Item</Button>}

                  <div className="mt-2 rounded-md bg-muted/30 p-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Nama TKA ({g.clients.length})</p>
                    {g.clients.length === 0 && <p className="text-sm text-muted-foreground">Belum ada client di grup ini.</p>}
                    <ol className="space-y-0.5 text-sm">
                      {g.clients.map((c, ci) => (
                        <li key={`${c.id ?? "n"}-${ci}`} className="flex items-center gap-2">
                          <span className="w-6 text-right tabular-nums text-muted-foreground">{ci + 1}.</span>
                          {c.id !== null
                            ? <Link href={`/clients/${c.id}`} className="min-w-0 truncate hover:underline">{c.name}</Link>
                            : <span className="min-w-0 truncate" title="Nama tanpa data client (dari invoice sistem lama)">{c.name} <span className="text-xs text-muted-foreground">(tanpa data client)</span></span>}
                          {c.noPaspor && <span className="text-xs text-muted-foreground">{c.noPaspor}</span>}
                          {editable && (
                            <Button variant="ghost" size="icon-xs" aria-label={`Keluarkan ${c.name}`} className="ml-auto text-destructive"
                              onClick={() => setGroup(g.key, (x) => ({ ...x, clients: x.clients.filter((_, i) => i !== ci) }))}><X /></Button>
                          )}
                        </li>
                      ))}
                    </ol>
                    {editable && <Button variant="outline" size="sm" className="mt-2" onClick={() => setPicker(g.key)}><UserPlus /> Add Client</Button>}
                  </div>
                </div>
              </div>
            ))}
            {editable && (
              <Button variant="secondary" size="sm" onClick={() => setS((x) => ({ ...x, groups: [...x.groups, { key: nextKey(), clients: [], items: [newItem()] }] }))}>
                <Plus /> Add Group
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tax</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {s.taxes.map((t, ti) => {
              const master = options.taxes.find((m) => String(m.id) === t.taxId);
              const items = [{ value: "", label: "Other (isi manual)" }, ...options.taxes.map((m) => ({ value: String(m.id), label: `${m.name} (${m.type === "REDUCTION" ? "−" : "+"}${m.percentage}%)` }))];
              return (
                <div key={t.key} className="grid grid-cols-2 gap-2 md:grid-cols-[14rem_minmax(0,1fr)_10rem_2rem] md:items-center">
                  <SearchSelect items={items} value={t.taxId} onValueChange={(v) => setTax(t.key, { taxId: v ?? "" })} className="col-span-2 w-full md:col-span-1" aria-label="Tax" />
                  <Input aria-label="Description" placeholder={master?.name ?? "Keterangan"} value={t.description} onChange={(e) => setTax(t.key, { description: e.target.value })} />
                  {master ? (
                    <span className="self-center text-right text-sm tabular-nums" title="Dihitung dari persentase">{fmtMoney(totals.taxValues[ti])}</span>
                  ) : (
                    <Input aria-label="Value" inputMode="decimal" value={t.value} onChange={(e) => setTax(t.key, { value: e.target.value })} />
                  )}
                  {editable ? (
                    <Button variant="ghost" size="icon-sm" aria-label="Hapus pajak" className="justify-self-end text-destructive"
                      onClick={() => setS((x) => ({ ...x, taxes: x.taxes.filter((y) => y.key !== t.key) }))}><X /></Button>
                  ) : <span />}
                </div>
              );
            })}
            {editable && (
              <Button variant="outline" size="sm" onClick={() => setS((x) => ({ ...x, taxes: [...x.taxes, { key: nextKey(), taxId: options.taxes[0] ? String(options.taxes[0].id) : "", description: "", value: "0" }] }))}>
                <Plus /> Add Tax
              </Button>
            )}

            <dl className="ml-auto max-w-sm space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt>Invoice Sub Total</dt><dd className="tabular-nums">Rp {fmtMoney(totals.subTotal)}</dd></div>
              {s.taxes.map((t, ti) => (
                <div key={t.key} className="flex justify-between text-muted-foreground">
                  <dt>{t.description || options.taxes.find((m) => String(m.id) === t.taxId)?.name || "Other"}</dt>
                  <dd className="tabular-nums">Rp {fmtMoney(totals.taxValues[ti])}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 text-base font-semibold"><dt>Invoice Total</dt><dd className="tabular-nums">Rp {fmtMoney(totals.total)}</dd></div>
              <p className="text-xs italic text-muted-foreground">{terbilang(totals.total)}</p>
            </dl>
          </CardContent>
        </Card>
      </fieldset>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background py-3">
        {editable && <Button onClick={save} disabled={pending}>{pending ? "Menyimpan…" : "Save"}</Button>}
        <Button variant="outline" nativeButton={false} render={<a href={`/print/invoices/${detail.id}`} target="_blank" rel="noopener" />}><Printer /> Print Invoice</Button>
        {detail.attachments.length > 0 && (
          <Button variant="outline" nativeButton={false} render={<a href={`/bff/invoices/${detail.id}/pdf?attachments=1`} target="_blank" rel="noopener" />}>
            <Files /> PDF + Lampiran ({detail.attachments.length})
          </Button>
        )}
        <Button variant="outline" nativeButton={false} render={<Link href="/invoices" />}>Back To List</Button>
        <RequestActions detail={detail} canEdit={canEdit} canApprove={canApprove} />
        {canEdit && (detail.status === "DRAFT" || canApprove) && (
          <span className="ml-auto">
            <ConfirmDelete title={`Hapus invoice ${detail.no ?? `#${detail.id}`}?`} description="No invoice di data client akan dikosongkan. Tindakan ini tidak bisa dibatalkan."
              onConfirm={async () => { const r = await deleteInvoice(detail.id); if (r.ok) router.push("/invoices"); return r; }} />
          </span>
        )}
      </div>

      {picker !== null && <ClientPicker
        open
        onOpenChange={(o) => !o && setPicker(null)}
        sponsorId={h.sponsorId ? Number(h.sponsorId) : null}
        exclude={inForm}
        onPick={(clients) => setGroup(picker, (g) => ({ ...g, clients: [...g.clients, ...clients] }))}
      />}
    </div>
  );
}
