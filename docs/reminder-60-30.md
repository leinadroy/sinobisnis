# Reminder Expired 60 + 30 hari

Rencana (2026-11-23): reminder pertama 60 hari dan reminder kedua 30 hari sebelum Expired Dokumen untuk 9 kelompok
Keperluan. Diatur lewat Data → Keperluan: kolom **Reminder Expired (hari)** (`ReminderExpiredDokumen`, template email 1)
dan **Reminder Expired ke-2 (hari)** (`ReminderExpired2nd`, template email 4). Data dibaca dari production 2026-11-23.

Tabel `keperluan` dipakai bersama aplikasi lama GeneXus yang masih mengirim reminder: nilai yang diisi di production
langsung dipakai aplikasi lama juga. `Reminder Enabled` aplikasi baru tetap mati selama aplikasi lama masih mengirim.

## Daftar final (disetujui user)

| Kelompok | KeperluanId: nama | Reminder 1 (sekarang → baru) | Reminder 2 (sekarang → baru) |
|---|---|---|---|
| Semua New ITAS | 43 New ITAS 312 - 2 Months | 60 | 0 → 30 |
| | 8 New ITAS 312 - 6 Months | 60 | 0 → 30 |
| | 42 New ITAS 312 - 7 Months | 60 | 0 → 30 |
| | 54 New ITAS 312 - 8 Months | 60 | 0 → 30 |
| | 82 New ITAS 312 - 9 Months | 60 | 0 → 30 |
| | 94 NEW ITAS 11 Bulan | 60 | 0 → 30 |
| | 10 New ITAS 312 - 12 Months | 60 | 0 → 30 |
| MERP ITAP | 57 MERP ITAP (Izin Masuk Kembali) | 60 | 0 → 30 |
| Kitas Investor | 47 Kitas Investor | 60 | 0 → 30 |
| ITAS Penyatuan Keluarga | 7 ITAS Penyatuan Keluarga 317 | 60 | 0 → 30 |
| Semua ITAS Extension | 66 ITAS Extention 2 Months | **30 (tetap)** | **0 (tetap)** |
| | 67 ITAS Extention 3 MONTHS | 60 | 0 → 30 |
| | 11 ITAS Extension 6 Months | 60 | 0 → 30 |
| | 12 ITAS Extension 7 Months | 60 | 0 → 30 |
| | 51 ITAS Extention 8 Months | 60 | 0 → 30 |
| | 13 ITAS Extension 12 Months | 60 | 0 → 30 |
| | 41 ITAS Extension 317 | 60 | 0 → 30 |
| | 38 EXTEND KITAS | 60 | 0 → 30 |
| ITAP | 87 ITAP | 60 | 0 → 30 |
| Semua Extend ITAS Investor | 58 Extend ITAS Investor 12 Bulan | 60 | 0 → 30 |
| | 96 Extend ITAS Investor 24 Bulan | 60 | 0 → 30 |
| Extend ITAS Penyatuan Keluarga | 85 Extend ITAS Penyatuan Keluarga | 60 | 0 → 30 |
| Alih Status | 14 Alih Status 6 Bulan | 60 | 0 → 30 |
| | 15 Alih Status 7 Bulan | 60 | 0 → 30 |
| | 97 Alih Status 10 Months | **0 → 60** | 0 → 30 |
| | 95 Alih Status 11 Months | 60 | 0 → 30 |
| | 16 Alih Status 12 Months | 60 | 0 → 30 |
| | 50 Alih Status ITAS ke ITAP | 60 | 0 → 30 |

Total yang diubah: 27 baris (Reminder 2 → 30), dan 1 di antaranya (97) Reminder 1 → 60. Baris 66 tidak diubah.
Dilewati: duplikat nonaktif tanpa client (9, 31, 35, 37, 39, 40).

## Langkah 2: temuan (production, 2026-11-23)

- Aplikasi lama sudah menjalankan "Schedule 2nd" setiap hari 07:00 WIB untuk Keperluan yang Reminder 2-nya > 0
  (sekarang hanya Visa Indeks C18, Business Visa 211 Extend 1 & 2). Mengisi 30 di production = aplikasi lama langsung
  mengirim reminder ke-2 mulai keesokan harinya, tanpa perubahan kode.
- Template 1 (subjek "Reminder Expired Dokumen"): "… dokumen @@Keperluan@@ yang akan segera expired dalam waktu dekat".
  Template 4 (subjek "Reminder Ke 2 Expired Dokumen"): "… dokumen @@Keperluan@@ yang akan segera expired". Template
  dipakai semua Keperluan (juga yang 14 hari), jadi teksnya tidak boleh menyebut "60 hari"/"30 hari".
- Reminder Expired dikirim ke Email Recipient aktif yang bukan Accounting (18 alamat unik; endah.rts tercatat dua kali).
- Keputusan user: template 1 dan 4 serta penerima dipakai apa adanya.

## Langkah 3: kualitas data dan simulasi (production, 2026-11-23)

- Reminder hanya melihat client yang tidak dihapus/diarsip. Dari 28 Keperluan di daftar, 133 client aktif punya
  Expired Dokumen kosong; 89 di antaranya belum Proses Selesai (wajar). **44 sudah Proses Selesai tapi Expired kosong**
  (28 selesai dalam 12 bulan terakhir; 39 punya Tanggal Terbit Dokumen). Daftar: `output/reminder-expired-kosong.csv`
  (git-ignored). Di aplikasi baru, membuka client lalu Save akan mengisi Expired otomatis dari Tanggal Terbit + Periode
  bila kolom Expired kosong.
- Simulasi 90 hari ke depan bila 60/30 aktif mulai 2026-11-24: ±216 email (±210 client reminder 1, ±218 client
  reminder 2), rata-rata 2–3 email per hari, paling banyak 6 email sehari; reminder ke-2 pertama sudah keluar besok.
- Aturan "tepat hari ke-N": client yang saat diaktifkan sudah kurang dari 30 hari menuju Expired tidak mendapat
  reminder ke-2 (tidak ada susulan).

## Langkah 4: susulan hari ke-N yang terlewat (kode aplikasi baru, belum di-commit)

- `reminder.logic.ts`: `catchUpDays(lastSuccess, today)` = hari setelah kiriman sukses terakhir sampai kemarin, maks. 7
  (`MAX_CATCH_UP_DAYS`); belum pernah sukses = 0, jadi menyalakan reminder baru (mis. ke-2 = 30) tidak membanjiri
  email. `categorize(..., back)` ikut memeriksa hari-hari itu; kolom Hari berisi selisih sebenarnya (mis. Sisa Hari 29).
- `reminders.service.ts`: `lastSuccess()` membaca log "Success Run …" 8 hari terakhir di datalog (aplikasi lama dan
  baru, termasuk "(0 items)", tanpa kiriman manual), per kategori + nama Keperluan. Berlaku juga untuk halaman Email
  Reminder (pratinjau) dan kirim manual.
- Dicek ke log production 2026-11-23: semua nama Keperluan di log cocok dengan tabel keperluan. Aplikasi lama tidak
  lagi mencatat "(0 items)" sejak 2026-11-16, jadi untuk banyak Keperluan jendela susulan 6 hari. Aman: hari yang sudah
  diperiksa memberi hasil yang sama, kecuali data client diisi/diubah belakangan (mis. Expired baru diisi) — client
  itu mendapat reminder terlambat, sesuai tujuan.
- Subjek email tidak diubah (keputusan langkah 2: template apa adanya).
- Tidak berpengaruh selama reminder masih dikirim aplikasi lama.

## Langkah 5: uji di staging (2026-11-23) — lolos

- Staging diisi seperti rencana production (27 Keperluan Reminder 2 = 30, Keperluan 97 Reminder 1 = 60; nilai ini
  dibiarkan). SMTP staging sementara diarahkan ke server SMTP palsu di laptop lalu dikembalikan ke nilai asli.
- Kirim: 9 email tertangkap SMTP palsu, mis. "Reminder Ke 2 Expired Dokumen - Alih Status 6 Bulan (1 client)" untuk
  client ber-Expired 2026-12-23 (tepat 30 hari). Reminder ke-2 yang baru dinyalakan tidak menyusulkan apa pun.
- Kirim ulang di hari yang sama: semua batch SKIPPED, 0 email (tidak dobel).
- Susulan: pratinjau untuk 2026-11-25 (seolah 24 Nov terlewat) memuat client Visa Indeks C20 ber-Expired 2026-12-08
  dengan "sisa 13", sama persis dengan pembanding SQL; Keperluan yang belum pernah sukses tidak disusulkan.
- Staging hanya punya 1 Email Recipient aktif (roy) dari 26, jadi tiap email di staging 1 penerima; production 18.

## Langkah berikutnya

6. Production: user mengisi nilai lewat Data → Keperluan.
7. Pantau tab Log Email Reminder minggu pertama.
