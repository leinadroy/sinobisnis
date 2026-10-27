"""SML Invoice Printer.

Ketik nomor invoice (mis. 26351/SML/X/2026) atau InvoiceId (mis. 2334),
klik Proses. Aplikasi membuat satu folder berisi:
  - PDF invoice
  - PDF invoice + semua lampiran (digabung, dengan bookmark)
  - folder attachments/ (file lampiran + index.csv)

Database hanya dibaca (read-only). Butuh VPN ke 10.10.3.23.

Tanpa tampilan (command line):  python app.py 26351/SML/X/2026
"""
import os
import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from invoiceprint.service import APP_DIR, process

DEFAULT_OUT = APP_DIR / "hasil"


class App(tk.Tk):
    def __init__(self):
        try:  # sharp text on scaled (high-DPI) Windows displays
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
        super().__init__()
        self.title("SML Invoice Printer")
        self.geometry("680x460")
        self.minsize(560, 380)
        self.events = queue.Queue()
        self.last_folder = None

        pad = {"padx": 10, "pady": 4}
        frm = ttk.Frame(self)
        frm.pack(fill="x", **pad)
        ttk.Label(frm, text="No Invoice / InvoiceId:").grid(row=0, column=0, sticky="w")
        self.key = ttk.Entry(frm, font=("Segoe UI", 11))
        self.key.grid(row=0, column=1, sticky="ew", padx=6)
        self.key.bind("<Return>", lambda e: self.start())
        self.btn = ttk.Button(frm, text="Proses", command=self.start)
        self.btn.grid(row=0, column=2)

        ttk.Label(frm, text="Simpan ke:").grid(row=1, column=0, sticky="w", pady=(6, 0))
        self.out = tk.StringVar(value=str(DEFAULT_OUT))
        ttk.Entry(frm, textvariable=self.out).grid(row=1, column=1, sticky="ew", padx=6, pady=(6, 0))
        ttk.Button(frm, text="Pilih...", command=self.pick).grid(row=1, column=2, pady=(6, 0))
        frm.columnconfigure(1, weight=1)

        self.bar = ttk.Progressbar(self, mode="determinate")
        self.bar.pack(fill="x", **pad)
        self.status = ttk.Label(self, text="Siap. Pastikan VPN sudah tersambung.")
        self.status.pack(anchor="w", padx=10)

        self.log = tk.Text(self, height=12, state="disabled", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True, **pad)

        self.open_btn = ttk.Button(self, text="Buka folder hasil", command=self.open_folder,
                                   state="disabled")
        self.open_btn.pack(anchor="e", padx=10, pady=(0, 10))
        self.key.focus()
        self.after(100, self.poll)

    def pick(self):
        d = filedialog.askdirectory(initialdir=self.out.get())
        if d:
            self.out.set(d)

    def write(self, text):
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def start(self):
        key = self.key.get().strip()
        if not key:
            messagebox.showwarning("Invoice", "Masukkan nomor invoice dulu.")
            return
        self.btn.configure(state="disabled")
        self.open_btn.configure(state="disabled")
        self.bar.configure(value=0, maximum=1)
        self.status.configure(text="Memproses...")
        self.write("-" * 60)
        threading.Thread(target=self.run, args=(key, self.out.get()), daemon=True).start()

    def run(self, key, out_root):
        try:
            folder = process(key, out_root,
                             log=lambda t: self.events.put(("log", t)),
                             progress=lambda d, n: self.events.put(("progress", (d, n))))
            self.events.put(("done", folder))
        except Exception as e:
            self.events.put(("error", e))

    def poll(self):
        try:
            while True:
                kind, val = self.events.get_nowait()
                if kind == "log":
                    self.write(val)
                elif kind == "progress":
                    done, total = val
                    self.bar.configure(maximum=total, value=done)
                    self.status.configure(text=f"Lampiran {done}/{total}")
                elif kind == "done":
                    self.last_folder = val
                    self.status.configure(text="Selesai.")
                    self.btn.configure(state="normal")
                    self.open_btn.configure(state="normal")
                elif kind == "error":
                    msg = str(val)
                    if "Can't connect" in msg or "timed out" in msg:
                        msg = "Tidak bisa konek ke database. Cek VPN.\n\n" + msg
                    self.write(f"ERROR: {msg}")
                    self.status.configure(text="Gagal.")
                    self.btn.configure(state="normal")
                    messagebox.showerror("Gagal", msg)
        except queue.Empty:
            pass
        self.after(100, self.poll)

    def open_folder(self):
        if self.last_folder:
            os.startfile(self.last_folder)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
        last = [0]

        def show(done, total):
            if done == total or done - last[0] >= 50:
                last[0] = done
                print(f"      lampiran {done}/{total}")
        process(sys.argv[1], out, progress=show)
    else:
        App().mainloop()
