Folder font tambahan untuk container web (PDF invoice). Opsional.

Layout cetak memakai Arial dan Impact. Tanpa font ini container memakai Liberation Sans (ukuran sama dengan Arial),
jadi tata letak tetap, hanya bentuk huruf sedikit beda. Agar persis seperti di Windows, salin dari `C:\Windows\Fonts`:
`arial.ttf`, `arialbd.ttf`, `ariali.ttf`, `arialbi.ttf`, `ARIALN.TTF`, `impact.ttf` ke folder ini, lalu
`docker compose restart web`. File font tidak di-commit (lisensi Microsoft).
