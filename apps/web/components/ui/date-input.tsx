"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' ('' bila kosong/tidak valid). */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** 'dd/mm/yyyy' (juga d/m/yyyy, pemisah - atau .) → 'YYYY-MM-DD'; null bila tidak valid. */
export function dmyToIso(s: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1000 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Ketik angka saja → otomatis jadi dd/mm/yyyy. */
function mask(raw: string): string {
  if (/[/.-]/.test(raw)) return raw.replace(/[^\d/.-]/g, "").slice(0, 10);
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  /** Nilai ISO 'YYYY-MM-DD' atau ''. */
  value: string | null | undefined;
  /** Dipanggil dengan ISO 'YYYY-MM-DD', atau '' bila dikosongkan. */
  onChange: (iso: string) => void;
};

/** Input tanggal dengan tampilan dd/mm/yyyy (tidak tergantung locale browser) + tombol kalender. */
export const DateInput = React.forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, onChange, onBlur, className, disabled, placeholder = "dd/mm/yyyy", ...props },
  ref,
) {
  const [text, setText] = React.useState(() => isoToDmy(value));
  const picker = React.useRef<HTMLInputElement>(null);

  // Sinkron bila nilai berubah dari luar (reset form, hitung otomatis, dsb.).
  React.useEffect(() => {
    setText((t) => (dmyToIso(t) === (value || null) || (!value && t === "") ? t : isoToDmy(value)));
  }, [value]);

  const handle = (raw: string) => {
    const t = mask(raw);
    setText(t);
    if (t === "") onChange("");
    else {
      const iso = dmyToIso(t);
      if (iso && iso !== value) onChange(iso);
    }
  };

  const openPicker = () => {
    const p = picker.current;
    if (!p) return;
    try { p.showPicker(); } catch { p.click(); }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(e) => handle(e.target.value)}
        onBlur={(e) => { setText(isoToDmy(dmyToIso(text) ?? value)); onBlur?.(e); }}
        className="pr-8"
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Pilih tanggal"
        onClick={openPicker}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarIcon className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => { setText(isoToDmy(e.target.value)); onChange(e.target.value); }}
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
      />
    </div>
  );
});
