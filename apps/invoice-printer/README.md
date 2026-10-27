# SML Invoice Printer

Aplikasi sederhana untuk mencetak invoice dari database `sinobisnis`.
Masukkan nomor invoice, lalu aplikasi membuat **satu folder** berisi:

```
hasil/26351-SML-X-2026/
├── Invoice-26351-SML-X-2026.pdf                    ← invoice saja
├── Invoice-26351-SML-X-2026-with-attachments.pdf   ← invoice + semua lampiran (dengan bookmark per TKA)
└── attachments/
    ├── 001_Liang_Yanmin_16400.pdf                  ← urut sesuai nama di invoice
    ├── ...
    └── index.csv                                   ← daftar file, nama TKA, ClientNo, AttachmentId
```

## Model invoice per perusahaan

Model dipilih otomatis dari prefix di nomor invoice:

| Prefix | Perusahaan | Model (contoh asli) | Kode |
|---|---|---|---|
| `SML` | Sinobisnis Mitra Lestari | `SML-Invoice.pdf` | `invoiceprint/layout.py` (`build_sml`) |
| `RTS` | Raqinna Triniti Sentosa | `RTS-Invoice.pdf` | `invoiceprint/layout_rts.py` |
| `JCSS` | Jassa Ceppat Sukses | `JCSS-Invoice.pdf` | `invoiceprint/layout_jcss.py` |

Prefix lain memakai model SML. Logo dan gambar latar ada di `assets/sml`, `assets/rts`, `assets/jcss`.

## Cara pakai

1. **Sekali saja:** double-click `Install.bat` (menginstal library Python).
2. Sambungkan **VPN** (database ada di 10.10.3.23).
3. Double-click `Jalankan.bat`.
4. Ketik nomor invoice, misalnya `26351/SML/X/2026` (atau InvoiceId, misalnya `2334`), lalu tekan **Enter** / klik **Proses**.
5. Setelah selesai, klik **Buka folder hasil**.

Folder hasil default: `hasil/` di dalam folder aplikasi (bisa diganti lewat tombol **Pilih...**).

### Lewat command line

```bash
python app.py 26351/SML/X/2026
python app.py 2334 "D:\Invoice"
```

## Kebutuhan

- Windows + Python 3.10 atau lebih baru
- Koneksi VPN ke server database
- File `.env` berisi kredensial database (template: `.env.example`)

## Keamanan

- Database **hanya dibaca**: setiap query dicek (hanya SELECT/SHOW/DESCRIBE/EXPLAIN/WITH) dan sesi dikunci `READ ONLY` di server (`invoiceprint/db.py`). Aplikasi tidak pernah mengubah data.
- `.env` dan folder `hasil/` tidak ikut git. Lampiran berisi dokumen pribadi TKA (paspor, dll.) — hati-hati saat membagikan.

## Isi folder

| File | Fungsi |
|---|---|
| `app.py` | Tampilan aplikasi (dan mode command line) |
| `invoiceprint/service.py` | Ambil data invoice, buat PDF, ekspor & gabung lampiran |
| `invoiceprint/layout.py` | Tata letak PDF invoice + koreksi typo (`CORRECTIONS`) |
| `invoiceprint/db.py` | Koneksi database read-only |
| `assets/` | Logo dan banner "INVOICE" |
| `Install.bat` / `Jalankan.bat` | Instal library / buka aplikasi |

Pemetaan tabel database ke isi invoice: lihat `docs/invoice-mapping.md` di root project.
