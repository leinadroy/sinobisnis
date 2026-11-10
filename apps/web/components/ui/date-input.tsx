"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** 'yyyy-mm-dd' → 'dd/mm/yyyy' ('' kalau kosong/tidak valid). */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 'dd/mm/yyyy' → 'yyyy-mm-dd'; null kalau belum lengkap atau tanggalnya tidak ada (mis. 31/02). */
export function dmyToIso(dmy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1000 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Garis miring otomatis saat mengetik angka: '010' → '01/0', '01012026' → '01/01/2026'. */
function autoSlash(raw: string, prev: string): string {
  if (raw.length < prev.length) return raw; // sedang menghapus: biarkan
  if (/[^\d/]/.test(raw)) raw = raw.replace(/[^\d/]/g, "");
  if (raw.includes("/")) return raw.slice(0, 10);
  const d = raw.slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  /** Nilai ISO 'yyyy-mm-dd' atau '' (kosong). */
  value: string | null | undefined;
  /** Dipanggil dengan 'yyyy-mm-dd' saat tanggal lengkap & valid, atau '' saat dikosongkan. */
  onChange: (iso: string) => void;
};

/**
 * Input tanggal berformat dd/mm/yyyy, tidak bergantung pada bahasa browser (input type="date" bawaan ikut
 * locale, mis. mm/dd/yyyy). Bisa diketik atau dipilih lewat tombol kalender; nilai keluar/masuk tetap ISO.
 */
export function DateInput({ value, onChange, className, disabled, onBlur, ...props }: Props) {
  const iso = value ?? "";
  const [text, setText] = React.useState(() => isoToDmy(iso));
  const picker = React.useRef<HTMLInputElement>(null);

  // Nilai diubah dari luar (reset form, Expired Dokumen otomatis, pilih di kalender): tampilkan ulang.
  React.useEffect(() => {
    setText((t) => ((dmyToIso(t) ?? (t.trim() ? null : "")) === iso ? t : isoToDmy(iso)));
  }, [iso]);

  const incomplete = text.trim() !== "" && dmyToIso(text) === null;

  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        disabled={disabled}
        value={text}
        aria-invalid={props["aria-invalid"] || incomplete || undefined}
        className="pr-8"
        onChange={(e) => {
          const t = autoSlash(e.target.value, text);
          setText(t);
          if (t.trim() === "") { if (iso !== "") onChange(""); return; }
          const next = dmyToIso(t);
          if (next !== null && next !== iso) onChange(next);
        }}
        onBlur={(e) => {
          // Ketikan belum lengkap/tidak valid: kembali ke tanggal terakhir yang sah.
          if (incomplete) setText(isoToDmy(iso));
          onBlur?.(e);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Pilih tanggal"
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          el.value = iso;
          try { el.showPicker(); } catch { el.focus(); el.click(); }
        }}
      >
        <CalendarDays className="size-4" />
      </button>
      {/* Kalender bawaan browser, tidak terlihat; hanya dipakai untuk memilih tanggal. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
      />
    </div>
  );
}
