# Perbaikan: Edit Data Client Visa lambat dibuka

- **Tanggal:** 2026-11-10
- **Branch / PR:** `roy/2026-11-10` → [leinadroy/sinobisnis#13](https://github.com/leinadroy/sinobisnis/pull/13) (commit `9a80e6b`)
- **Database uji:** staging (`sinobisnis_staging` di 10.10.3.62)

## Masalah

Membuka halaman Edit Client (`/clients/[id]`) terasa lambat. Di staging, form baru tampil setelah **±27 detik**. Menyimpan form juga lambat, karena setelah simpan API memanggil fungsi yang sama.

## Penyebab

Endpoint `GET /clients/:id` menjalankan dua query ke tabel yang **tidak punya index** pada kolom pencariannya. Hal ini sudah dicek dengan `SHOW INDEX` dan sama di staging maupun production:

| Tabel | Index yang ada | Kolom yang dicari | Akibat |
|---|---|---|---|
| `attachment` | hanya `PRIMARY (AttachmentId)` | `AttachmentClientNo` | full scan |
| `datalog` (~355 ribu baris) | hanya `PRIMARY (DataLogId)` | `DataLogTableName`, `DataLogTableId` | full scan |

Hasil pengukuran langsung ke staging (hanya SELECT):

| Query | Waktu |
|---|---|
| `SELECT AttachmentId, AttachmentName, LENGTH(AttachmentBlob) FROM attachment WHERE AttachmentClientNo = ?` | **22 detik** |
| Query yang sama **tanpa** `LENGTH(AttachmentBlob)` | 6–18 ms |
| `datalog`: 20 log terbaru + log pertama client | **±5 detik** |
| Data dropdown (`/master/options`) | ±0,2 detik (tidak bermasalah) |

**Inti masalah lampiran:** karena tidak ada index, database harus memeriksa semua baris `attachment`. Kolom `LENGTH(AttachmentBlob)` ada di query yang sama, jadi InnoDB ikut membaca **isi file (blob) semua lampiran di tabel**, bukan hanya milik client yang dibuka. Di staging tabel ini hanya sebagian, sehingga hasilnya 22 detik. Di production tabel `attachment` berukuran **±7,7 GB**, dan semuanya terbaca setiap kali form dibuka atau disimpan.

## Perbaikan

Struktur database **tidak diubah** (aturan proyek: tidak boleh ada DDL atau migrasi). Semua perbaikan ada di kode.

### 1. Lampiran — query dipecah dua (`apps/api/src/clients/clients.service.ts`)

1. Ambil `AttachmentId` dan `AttachmentName` milik client **tanpa menyentuh blob**. Ini tetap full scan, tapi ringan.
2. Hitung `LENGTH(AttachmentBlob)` lewat **primary key** (`WHERE AttachmentId IN (...)`), hanya untuk lampiran client itu.

Hasil: **22 detik → ±75 ms.**

### 2. Riwayat perubahan — dipisah dari form

- Endpoint baru: **`GET /clients/:id/history`**. Endpoint ini memakai **satu** scan `datalog` (sebelumnya dua). Semua log client diambil, lalu diurutkan di kode dan diambil 20 terbaru serta tanggal dibuat dan diubah.
- `GET /clients/:id` tidak lagi memuat riwayat. Tipe `ClientDetail` tidak lagi punya `history`, `createdAt` dan `updatedAt`. Tipe baru `ClientHistory` ada di `packages/shared/src/client.ts`.
- Di web, kartu **"Riwayat Perubahan"** sekarang komponen terpisah (`apps/web/app/(app)/clients/history-card.tsx`) yang dimuat di dalam `<Suspense>` dengan placeholder loading. Form, lampiran dan conversation langsung tampil; riwayat menyusul.
- `key` pada `ClientForm` sekarang memakai isi form, bukan lagi `updatedAt` dari datalog. Setelah simpan, form tetap ter-reset dengan data terbaru.

### File yang diubah

| File | Perubahan |
|---|---|
| `apps/api/src/clients/clients.service.ts` | Query lampiran dua langkah; `get()` tanpa datalog; fungsi baru `history()` |
| `apps/api/src/clients/clients.controller.ts` | Route `GET /clients/:id/history` |
| `packages/shared/src/client.ts` | `ClientDetail` diringkas; tipe `ClientHistory` dan `ClientHistoryRow` |
| `apps/web/app/(app)/clients/[id]/page.tsx` | Riwayat di dalam `<Suspense>`; key form |
| `apps/web/app/(app)/clients/conversation-panel.tsx` | Kartu riwayat dipindah keluar |
| `apps/web/app/(app)/clients/history-card.tsx` | Baru: kartu riwayat + skeleton |

## Hasil

| Ukuran (lokal → staging) | Sebelum | Sesudah |
|---|---|---|
| `GET /clients/:id` | ±27 detik | **±0,43 detik** |
| Form tampil di halaman | ±27 detik | **0,7–1,2 detik** |
| Riwayat perubahan tampil | ±27 detik (bersama form) | ±5 detik (menyusul, form tidak menunggu) |

## Verifikasi

- Type-check `packages/shared`, `apps/api` dan `apps/web` lolos.
- Endpoint diuji ke API lokal yang terhubung ke staging (client 1 dan 9175): data lampiran (termasuk ukuran file) dan riwayat benar.
- Halaman diukur secara streaming: form muncul lebih dulu, placeholder riwayat tampil, lalu riwayat menyusul.
- **Belum dicoba manual di browser:** tampilan halaman dan alur simpan form.

## Sisa / catatan

- Riwayat tetap butuh ±4–5 detik karena `datalog` harus di-scan penuh. Agar benar-benar cepat perlu index, misalnya `INDEX (DataLogTableName, DataLogTableId)` di `datalog` dan `INDEX (AttachmentClientNo)` di `attachment`. Itu **perubahan struktur database**, jadi hanya boleh dilakukan lewat keputusan terpisah, misalnya saat go-live.
- Pola yang sama (filter tanpa index plus kolom blob di query yang sama) perlu dihindari di query lain: selalu ambil id dulu, lalu baca blob atau `LENGTH(blob)` lewat primary key.
