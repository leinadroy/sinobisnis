# Modul Edit Users & Ganti Password

Dokumen ini menjelaskan cara kerja pengelolaan user dan password di aplikasi Sinobisnis baru
(NestJS API + Next.js web): dari form di layar, Server Action, endpoint API, sampai kolom di tabel
`users`. Tabel yang dipakai adalah tabel `users` database yang sedang aktif (sama dengan sumber login).

## 1. Ada tiga tempat mengubah user / password

| Tempat | Siapa | Untuk apa | Menu |
|--------|-------|-----------|------|
| **Security → Users** | yang punya akses menu `users` (Developer / All Access) | tambah user, edit user orang lain, set/ganti password siapa saja, aktif/nonaktif, hapus | `/security/users` |
| **Account → Change Password** | user yang sedang login | ganti password sendiri (wajib tahu password lama) | `/account/password` |
| **Script `user:password`** | admin di server/laptop | bootstrap password pertama (mis. user lama yang hashnya belum bisa diverifikasi) | terminal `apps/api` |

Ketiganya menulis ke kolom yang sama: `UsersHashedPassword` + `UsersSalt`.

## 2. Cara password disimpan (inti modul)

Logika ada di [`apps/api/src/auth/password.ts`](../apps/api/src/auth/password.ts):

- **Password baru = bcrypt.** `hashPassword(pwd)` → `{ hashedPassword: bcrypt.hash(pwd, 10), salt: 'bcrypt' }`.
  Jadi `UsersSalt = 'bcrypt'` adalah penanda bahwa hash-nya format baru.
- **Verifikasi** `verifyPassword(user, pwd)`:
  - `UsersSalt === 'bcrypt'` → `bcrypt.compare(pwd, hash)` (bisa diverifikasi).
  - selain itu (hash lama GeneXus: salt 64 hex + hash 64 hex) → **selalu `false`**, karena algoritma lama belum diketahui.
- **Akibatnya:** user warisan GeneXus **tidak bisa login** di aplikasi baru sampai password-nya diganti
  (lewat salah satu dari tiga tempat di atas). Password lama tidak bisa dipulihkan — hash itu satu arah.
- Password bcrypt **tidak bisa dipakai di aplikasi GeneXus lama**. Jadi selama aplikasi lama masih dipakai,
  ganti password hanya untuk user yang tidak perlu login di aplikasi lama.

> Password asli tidak pernah disimpan. Dari `UsersSalt`/`UsersHashedPassword` tidak bisa dihitung mundur ke
> password-nya.

## 3. Alur "Change Password" (user ganti password sendiri)

```
Account → Change Password  (/account/password)
  password-form.tsx  → changePassword(values)           [Server Action]
    actions.ts       → POST /auth/change-password { current, password }
      auth.service.changePassword(userId, current, next):
        1. ambil user dari authDb
        2. verifyPassword(user, current) — salah → 400 "Password lama salah."
        3. user.update(data: hashPassword(next))        → simpan bcrypt
```

- Form: tiga kolom — Password Lama, Password Baru, Konfirmasi. Validasi (`account/schema.ts`):
  password baru **min 6 karakter**, konfirmasi harus sama.
- Endpoint `POST /auth/change-password` bertanda `@AllowOnReadOnly()` → tetap jalan di profil hanya-baca,
  karena login/password ditulis ke **database login** (lihat bagian 6), bukan ke database hanya-baca.
- Hanya mengubah password milik `userId` dari token — tidak bisa dipakai mengganti password orang lain.

## 4. Alur "Security → Users" (admin kelola user)

Halaman & form:
- Daftar: `/security/users` (`users-table.tsx`, `columns.tsx`).
- Tambah: `/security/users/new` → butuh akses **edit** menu `users`.
- Edit: `/security/users/[id]` → butuh akses **view**; tombol Save muncul hanya bila **edit**.
- Form sama untuk tambah & edit: `user-form.tsx` (Fullname, Username, Email, Role, Password, Retype
  Password, Is Active).

Server Action → API ([`security/users/actions.ts`](../apps/web/app/\(app\)/security/users/actions.ts)):

| Aksi | Endpoint | Service |
|------|----------|---------|
| Tambah | `POST /users` | `UsersService.create` |
| Edit | `PATCH /users/:id` | `UsersService.update` |
| Hapus | `DELETE /users/:id` | `UsersService.remove` |

Aturan di [`users.service.ts`](../apps/api/src/users/users.service.ts) dan DTO
([`users.dto.ts`](../apps/api/src/users/users.dto.ts)):

- **Password saat tambah:** wajib, min 6 karakter → disimpan bcrypt (`hashPassword`).
- **Password saat edit:** **opsional** — kosong = tidak diganti; diisi = diganti (min 6, disimpan bcrypt).
  Field password selalu dikirim kosong saat form dibuka (tidak pernah menampilkan password lama).
- **Username:** 3–50 karakter (huruf/angka/titik/`_`/`-`), dicek unik manual (`ensureUniqueUsername`) karena
  tabel lama tidak punya index unik.
- **Role:** wajib ada dan valid (`ensureRole`).
- **Akun sendiri:** tidak bisa dinonaktifkan sendiri, tidak bisa dihapus sendiri.
- **Hapus:** ikut menghapus `usercookie`; bila masih ada data terkait (log, notifikasi, antrian cetak) →
  409 "Nonaktifkan saja user ini." Di profil hanya-baca+users (bagian 6) hapus **dilarang**, hanya nonaktif.

## 5. Siapa boleh apa (otorisasi)

- Controller user bertanda `@Menu('users')` → guard cek akses menu `users` dari role user (view/edit).
- Validasi di form (zod) dan di Server Action diulang; **otorisasi sebenarnya tetap di API**, bukan di web.
- `POST /users` dan `PATCH /users/:id` bertanda `@AllowUsersWrite()`; `DELETE` tidak (lihat bagian 6).

## 6. Database mana yang ditulis (penting saat pindah profil)

Baik login, Change Password, maupun Security → Users memakai **`prisma.authDb`** — yaitu sumber login profil
yang sedang aktif:

- **Profil tulis biasa** (`local`, `staging`, dan `production` setelah go-live 2026-11-12): user dibaca &
  ditulis di database itu sendiri.
- **Profil hanya-baca dengan `DB_AUTH_<PROFIL>`** (mis. production saat masih read-only): login & user diambil
  dari database login terpisah (mis. `local`); endpoint login/password/pindah-DB bertanda `@AllowOnReadOnly()`.
- **Profil hanya-baca + `DB_WRITE_USERS_<PROFIL>=1`:** koneksi khusus hanya mengizinkan `user.create`/
  `user.update` di tabel `users` database itu; `ReadOnlyGuard` hanya meloloskan endpoint `@AllowUsersWrite()`
  (tambah/edit user) — **hapus user tetap ditolak**.

Konsekuensi: setelah **pindah profil DB**, semua JWT lama tidak berlaku (token membawa `db`) dan user harus
login ulang. Kalau database tujuan belum punya satu pun user (Developer) berpassword bcrypt, **tidak ada yang
bisa login** di aplikasi baru.

## 7. Bootstrap lewat script (kalau belum bisa login sama sekali)

Dari folder `apps/api` (lihat header [`scripts/set-password.ts`](../apps/api/scripts/set-password.ts)):

```bash
npm run user:password -- <username>                        # database DATABASE_URL (lokal)
npm run user:password -- <username> --profile production   # profil tertentu di DB_PROFILES
```

- Password diminta tersembunyi (atau lewat env `USER_PASSWORD`), min 6 karakter, disimpan bcrypt, user
  sekaligus diaktifkan.
- `--profile <p>` hanya-baca hanya jalan bila `DB_WRITE_USERS_<P>=1`.
- Dipakai untuk memberi password pertama ke user warisan GeneXus agar bisa login di aplikasi baru.

## 8. File terkait

- API: `apps/api/src/auth/password.ts`, `src/auth/auth.service.ts` (`changePassword`), `src/users/*`
  (controller, service, dto), `src/common/decorators.ts` (`@Menu`, `@AllowUsersWrite`, `@AllowOnReadOnly`),
  `src/auth/guards.ts` (`ReadOnlyGuard`), `src/prisma/users-only.ts`, `scripts/set-password.ts`.
- Web: `apps/web/app/(app)/account/password/*`, `app/(app)/account/{actions,schema}.ts`,
  `app/(app)/security/users/*`.
