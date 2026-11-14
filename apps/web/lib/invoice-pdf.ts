import "server-only";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, StandardFonts, rgb } from "pdf-lib";
import { TOKEN_COOKIE } from "./api";

/**
 * PDF invoice dibuat dengan merender halaman cetak /print/invoices/[id] memakai Chrome/Edge headless (layout sama
 * persis dengan tombol Print), lalu lampiran PDF/JPG/PNG digabung di belakangnya dengan bookmark — pengganti
 * "invoice + lampiran" di apps/invoice-printer.
 */

const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/microsoft-edge",
];

export function findBrowser(): string | null {
  const env = process.env.PDF_BROWSER_PATH?.trim();
  if (env) return existsSync(env) ? env : null;
  return BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/** Alamat web ini dari sisi server (bukan alamat publik di belakang reverse proxy). */
const renderOrigin = () => (process.env.PDF_RENDER_ORIGIN ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/+$/, "");

export class PdfError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

/**
 * Render halaman cetak (`path`, mis. /print/invoices/12) ke PDF dengan sesi login user yang sama.
 * Ukuran kertas mengikuti @page di CSS halaman; `readySelector` = elemen yang menandakan halaman sudah lengkap.
 */
export async function renderPrintPdf(path: string, token: string, readySelector: string, notFound = "Data tidak ditemukan."): Promise<Uint8Array> {
  const executablePath = findBrowser();
  if (!executablePath) throw new PdfError("Chrome/Edge tidak ditemukan di server. Isi PDF_BROWSER_PATH di .env web.", 503);
  const origin = renderOrigin();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--no-first-run"] });
  try {
    await browser.setCookie({ name: TOKEN_COOKIE, value: token, domain: new URL(origin).hostname, path: "/", httpOnly: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });
    const url = `${origin}${path}`;
    let res = await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    // Gangguan sesaat (mis. halaman baru dikompilasi server development, atau API sedang restart): coba sekali lagi.
    if (!res || res.status() >= 500) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    }
    if (!res || !res.ok()) throw new PdfError(res?.status() === 404 ? notFound : `Halaman cetak gagal dimuat (${res?.status() ?? "tanpa respons"}).`, res?.status() === 404 ? 404 : 502);
    if (new URL(page.url()).pathname.startsWith("/login")) throw new PdfError("Sesi login habis. Silakan login ulang.", 401);
    await page.waitForSelector(readySelector, { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Render halaman cetak invoice ke PDF A4 dengan sesi login user yang sama. */
export function renderInvoicePdf(invoiceId: number, token: string): Promise<Uint8Array> {
  return renderPrintPdf(`/print/invoices/${invoiceId}`, token, ".invoice-print .page", "Invoice tidak ditemukan.");
}

export interface PdfAttachment {
  title: string;
  bytes: Uint8Array;
}

type Kind = "pdf" | "jpg" | "png" | null;
function kindOf(b: Uint8Array): Kind {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  return null;
}

interface Bookmark {
  title: string;
  page: number;
  children?: Bookmark[];
}

/** Bookmark (outline) PDF; pdf-lib belum punya API-nya, jadi kamus Outlines dibuat langsung. */
function addOutline(doc: PDFDocument, items: Bookmark[]) {
  const ctx = doc.context;
  const pages = doc.getPages();
  const build = (list: Bookmark[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = list.map(() => ctx.nextRef());
    let count = 0;
    list.forEach((b, i) => {
      const dict = new Map<PDFName, PDFHexString | PDFRef | PDFArray | PDFNumber>([
        [PDFName.of("Title"), PDFHexString.fromText(b.title)],
        [PDFName.of("Parent"), parent],
        [PDFName.of("Dest"), ctx.obj([pages[Math.min(b.page, pages.length - 1)].ref, PDFName.of("Fit")]) as PDFArray],
      ]);
      if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
      if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
      if (b.children?.length) {
        const sub = build(b.children, refs[i]);
        dict.set(PDFName.of("First"), sub.first);
        dict.set(PDFName.of("Last"), sub.last);
        dict.set(PDFName.of("Count"), PDFNumber.of(sub.count));
        count += sub.count;
      }
      ctx.assign(refs[i], PDFDict.fromMapWithContext(dict, ctx));
      count += 1;
    });
    return { first: refs[0], last: refs[refs.length - 1], count };
  };
  const root = ctx.nextRef();
  const top = build(items, root);
  ctx.assign(root, ctx.obj({ Type: "Outlines", First: top.first, Last: top.last, Count: top.count }));
  doc.catalog.set(PDFName.of("Outlines"), root);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

/** Font standar PDF hanya WinAnsi: karakter lain diganti '?'. */
const ansi = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

/**
 * Gabung PDF invoice + lampiran (urutan sesuai input). PDF disalin per halaman, JPG/PNG diletakkan di halaman A4,
 * file lain / PDF rusak dicantumkan di halaman terakhir. Bookmark: Invoice, lalu Attachments → tiap lampiran.
 */
export async function mergeInvoicePdf(invoicePdf: Uint8Array, invoiceNo: string, attachments: PdfAttachment[]) {
  const out = await PDFDocument.create();
  out.setTitle(`Invoice ${invoiceNo}`);
  const inv = await PDFDocument.load(invoicePdf);
  for (const p of await out.copyPages(inv, inv.getPageIndices())) out.addPage(p);
  const marks: Bookmark[] = [{ title: `Invoice ${invoiceNo}`, page: 0 }];
  const children: Bookmark[] = [];
  const skipped: string[] = [];

  for (const a of attachments) {
    const start = out.getPageCount();
    const kind = kindOf(a.bytes);
    try {
      if (kind === "pdf") {
        const src = await PDFDocument.load(a.bytes, { ignoreEncryption: true });
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
      } else if (kind === "jpg" || kind === "png") {
        const img = kind === "jpg" ? await out.embedJpg(a.bytes) : await out.embedPng(a.bytes);
        const [W, H, M] = [595.28, 841.89, 28];
        const s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1.5);
        const page = out.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
      } else {
        skipped.push(`${a.title} (${a.bytes.length ? "bukan PDF/JPG/PNG" : "file kosong"})`);
        continue;
      }
      children.push({ title: a.title, page: start });
    } catch (e) {
      while (out.getPageCount() > start) out.removePage(out.getPageCount() - 1);
      skipped.push(`${a.title} (rusak: ${e instanceof Error ? e.message.slice(0, 80) : "tidak bisa dibaca"})`);
    }
  }

  if (children.length) marks.push({ title: `Attachments (${children.length})`, page: children[0].page, children });
  if (skipped.length) {
    const font = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);
    let page = out.addPage([595.28, 841.89]);
    marks.push({ title: `Tidak digabung (${skipped.length})`, page: out.getPageCount() - 1 });
    let y = 790;
    page.drawText("Lampiran yang tidak bisa digabung", { x: 50, y, size: 13, font: bold });
    y -= 26;
    for (const s of skipped) {
      if (y < 60) { page = out.addPage([595.28, 841.89]); y = 790; }
      page.drawText(ansi(`- ${s}`).slice(0, 110), { x: 50, y, size: 9.5, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 15;
    }
  }
  addOutline(out, marks);
  return { bytes: await out.save(), pages: out.getPageCount(), merged: children.length, skipped };
}
