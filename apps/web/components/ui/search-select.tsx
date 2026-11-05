"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

export type SearchSelectItem = { value: string; label: string }

/**
 * Combo box yang bisa diketik untuk mencari (pengganti Select di form & filter).
 * Nilai berupa string `value` dari item; "" boleh menjadi item tersendiri (mis. "Semua status", "— kosong —").
 * Nilai yang tidak ada di daftar tampil sebagai placeholder.
 */
export function SearchSelect({
  items,
  value,
  onValueChange,
  placeholder = "Ketik untuk mencari…",
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  emptyText = "Tidak ditemukan.",
}: {
  items: SearchSelectItem[]
  value: string | null | undefined
  onValueChange: (value: string) => void
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
  "aria-invalid"?: boolean
  emptyText?: string
}) {
  const selected = React.useMemo(
    () => items.find((i) => i.value === (value ?? "")) ?? null,
    [items, value]
  )
  // Teks ketikan dikontrol: saat popup tertutup tanpa memilih, kembali ke label pilihan yang tersimpan.
  const label = selected?.label ?? ""
  const [inputValue, setInputValue] = React.useState(label)
  const [prevLabel, setPrevLabel] = React.useState(label)
  if (prevLabel !== label) {
    // pilihan berubah dari luar (atau baru dipilih): tampilkan labelnya
    setPrevLabel(label)
    setInputValue(label)
  }

  return (
    <Combobox.Root
      items={items}
      value={selected}
      inputValue={inputValue}
      onInputValueChange={(v) => setInputValue(v)}
      onOpenChange={(open) => { if (!open) setInputValue(label) }}
      onValueChange={(item) => onValueChange((item as SearchSelectItem | null)?.value ?? "")}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.InputGroup
        data-slot="search-select"
        className={cn(
          "relative flex h-8 w-fit items-center rounded-lg border border-input bg-transparent text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:bg-input/30",
          className
        )}
      >
        <Combobox.Input
          id={id}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          placeholder={placeholder}
          // Teks pilihan terseleksi saat diklik/fokus, jadi ketikan langsung menggantinya (bukan menyambung).
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => {
            // setelah render (klik bisa menutup popup dan mengembalikan teks ke label)
            const el = e.currentTarget
            setTimeout(() => { if (document.activeElement === el && el.value === label) el.select() }, 0)
          }}
          className="h-full min-w-0 flex-1 truncate bg-transparent pr-8 pl-2.5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Combobox.Trigger
          aria-label="Buka pilihan"
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground outline-none"
        >
          <ChevronDownIcon className="pointer-events-none size-4" />
        </Combobox.Trigger>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
          <Combobox.Popup
            data-slot="search-select-content"
            className="w-(--anchor-width) min-w-36 max-w-(--available-width) origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Combobox.Empty className="px-2.5 py-2 text-sm text-muted-foreground empty:p-0">
              {emptyText}
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0">
              {(item: SearchSelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="flex-1">{item.label}</span>
                  <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
