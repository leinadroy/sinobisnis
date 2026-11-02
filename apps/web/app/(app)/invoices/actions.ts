"use server";

import { revalidatePath } from "next/cache";
import type { CreateInvoiceInput, CreateInvoiceResult, InvoiceableClientRow, InvoiceDetail, InvoiceInput, PriceListItem } from "@sml/shared";
import { apiFetch, runAction } from "@/lib/api";

const refresh = (id?: number) => {
  revalidatePath("/invoices");
  revalidatePath("/invoices/requests");
  revalidatePath("/clients");
  if (id) revalidatePath(`/invoices/${id}`);
};

export async function createInvoice(input: CreateInvoiceInput) {
  if (!input.clientIds.length) return { ok: false as const, error: "Pilih minimal satu client." };
  if (!input.companyId) return { ok: false as const, error: "Company wajib dipilih." };
  const res = await runAction(() => apiFetch<CreateInvoiceResult>("/invoices", { method: "POST", json: input }));
  if (res.ok) refresh();
  return res;
}

export async function saveInvoice(id: number, input: InvoiceInput) {
  const res = await runAction(() => apiFetch<InvoiceDetail>(`/invoices/${id}`, { method: "PUT", json: input }));
  if (res.ok) refresh(id);
  return res;
}

export async function deleteInvoice(id: number) {
  const res = await runAction(() => apiFetch(`/invoices/${id}`, { method: "DELETE" }));
  if (res.ok) refresh();
  return res;
}

export async function requestEdit(id: number, reason: string) {
  if (!reason.trim()) return { ok: false as const, error: "Alasan request edit wajib diisi." };
  const res = await runAction(() => apiFetch<InvoiceDetail>(`/invoices/${id}/request-edit`, { method: "POST", json: { reason } }));
  if (res.ok) refresh(id);
  return res;
}

export async function cancelRequest(id: number) {
  const res = await runAction(() => apiFetch<InvoiceDetail>(`/invoices/${id}/cancel-request`, { method: "POST" }));
  if (res.ok) refresh(id);
  return res;
}

export async function decideRequest(requestId: number, invoiceId: number, approve: boolean) {
  const res = await runAction(() => apiFetch(`/invoices/requests/${requestId}/${approve ? "approve" : "reject"}`, { method: "POST" }));
  if (res.ok) refresh(invoiceId);
  return res;
}

export async function deleteInvoiceAttachment(invoiceId: number, attachmentId: number) {
  const res = await runAction(() => apiFetch(`/invoices/attachments/${attachmentId}`, { method: "DELETE" }));
  if (res.ok) revalidatePath(`/invoices/${invoiceId}`);
  return res;
}

/** Cari client belum ber-invoice untuk ditambahkan ke grup (dialog Add Client). */
export async function searchInvoiceableClients(params: { search?: string; sponsorId?: number | null }) {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.sponsorId) qs.set("sponsorId", String(params.sponsorId));
  return runAction(() => apiFetch<InvoiceableClientRow[]>(`/invoices/invoiceable-clients?${qs}`));
}

/** Daftar harga Kontrak saat Bill To / tanggal di form invoice diganti. */
export async function fetchPriceList(billToId: number, date: string | null) {
  const qs = new URLSearchParams({ billToId: String(billToId) });
  if (date) qs.set("date", date);
  return runAction(() => apiFetch<PriceListItem[]>(`/invoices/price-list?${qs}`));
}
