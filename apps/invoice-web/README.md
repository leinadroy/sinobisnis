# SML Invoice Web

Versi web dari Invoice Printer, untuk dipasang di **server kantor**.
User login, ketik nomor invoice, lalu download:

- **Invoice** (PDF). Model SML / RTS / JCSS dipilih otomatis dari prefix nomor.
- **Invoice + lampiran** (PDF digabung, dengan bookmark per TKA)
- **Lampiran** (ZIP)

Database `sinobisnis` **hanya dibaca**. Setiap query dicek dan sesi dikunci `READ ONLY` (`invoiceprint/db.py`).

## Syarat server

- Satu jaringan dengan database **10.10.3.23** (port 3306), atau tersambung VPN permanen ke jaringan itu
- Python 3.10+ (Windows Server atau Linux)
- Disk kosong cukup untuk hasil sementara (satu invoice besar bisa ±300 MB: PDF gabungan + ZIP)

## Instalasi

```bash
# 1. salin folder invoice-web ke server, lalu di dalam folder itu:
python -m pip install -r requirements.txt

# 2. konfigurasi
copy .env.example .env        # Linux: cp .env.example .env
#    isi DB_USER, DB_PASS, dan SECRET_KEY. Buat SECRET_KEY dengan:
python -c "import secrets;print(secrets.token_urlsafe(48))"

# 3. buat user (password diminta di layar, min 8 karakter)
python manage_users.py add rosiva "Rosiva Dewi"

# 4. jalankan
python main.py                # atau run.bat / ./run.sh
```

Buka `http://<ip-server>:8000` dari komputer di jaringan kantor.

## Kelola user

User aplikasi disimpan di `data/users.json` (password di-hash PBKDF2), **bukan** di database sinobisnis.

```bash
python manage_users.py list
python manage_users.py add nabila "Nabila Lutvia"
python manage_users.py passwd nabila
python manage_users.py remove nabila
```

Login gagal 5x berturut-turut akan mengunci username/IP tersebut selama 5 menit.

## Jalan otomatis saat server menyala

**Windows Server** (pakai [NSSM](https://nssm.cc)):

```bash
nssm install SMLInvoiceWeb "C:\Python313\python.exe" "C:\apps\invoice-web\main.py"
nssm set SMLInvoiceWeb AppDirectory "C:\apps\invoice-web"
nssm start SMLInvoiceWeb
```

**Linux** (systemd), file `/etc/systemd/system/sml-invoice-web.service`:

```ini
[Unit]
Description=SML Invoice Web
After=network-online.target

[Service]
WorkingDirectory=/opt/invoice-web
ExecStart=/usr/bin/python3 main.py
Restart=always
User=invoice

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now sml-invoice-web
```

## HTTPS

Kalau aplikasi bisa diakses dari luar jaringan kantor, wajib HTTPS. Pilih salah satu:

- **Langsung dari aplikasi**: isi `SSL_CERTFILE` dan `SSL_KEYFILE` di `.env`, lalu set `COOKIE_SECURE=1`.
- **Lewat reverse proxy** (IIS / Nginx / Caddy): proxy ke `http://127.0.0.1:8000`, set `HOST=127.0.0.1`, `COOKIE_SECURE=1`, dan `TRUSTED_PROXIES` ke IP proxy. Naikkan batas ukuran response/timeout proxy, karena PDF gabungan bisa >100 MB.

## Pengaturan (`.env`)

| Kunci | Default | Keterangan |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | | Koneksi database sinobisnis (read-only) |
| `HOST`, `PORT` | `0.0.0.0`, `8000` | Alamat web server |
| `SECRET_KEY` | | Wajib, min 32 karakter. Untuk menandatangani cookie login |
| `COOKIE_SECURE` | `0` | `1` kalau lewat HTTPS |
| `SSL_CERTFILE`, `SSL_KEYFILE` | | HTTPS langsung dari aplikasi (opsional) |
| `TRUSTED_PROXIES` | `127.0.0.1` | IP reverse proxy |
| `JOB_TTL_HOURS` | `6` | Hasil dihapus otomatis setelah sekian jam |
| `MAX_JOBS` | `2` | Jumlah invoice yang diproses bersamaan |

## Keamanan data

- Lampiran berisi paspor dan dokumen pribadi TKA. Semua halaman dan download butuh login, dan setiap user hanya bisa melihat proses miliknya sendiri.
- Hasil disimpan sementara di `data/jobs/` dan dihapus otomatis setelah `JOB_TTL_HOURS`.
- `.env` dan `data/` jangan dibagikan atau di-commit.

## Struktur

| Path | Isi |
|---|---|
| `main.py` | Web server (FastAPI): login, proses, status, download |
| `jobs.py` | Antrian proses di background + pembersihan otomatis |
| `auth.py`, `manage_users.py` | User & password aplikasi |
| `invoiceprint/` | Inti: ambil data, layout SML/RTS/JCSS, gabung lampiran (sama dengan `apps/invoice-printer`) |
| `templates/`, `static/` | Halaman web |
| `assets/` | Logo & gambar latar per perusahaan |
