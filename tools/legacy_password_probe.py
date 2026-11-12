"""
Tebak rumus hash password GeneXus lama dari users.UsersSalt + UsersHashedPassword.

Aplikasi baru hanya bisa verifikasi password bcrypt; user warisan GeneXus (UsersSalt 64/32 hex,
UsersHashedPassword 64 hex = SHA-256 huruf besar) belum bisa login karena rumusnya belum diketahui.
Script ini TIDAK membongkar password. Ia butuh SATU pasangan (username, password yang kamu tahu),
membaca salt+hash user itu dari database (READ ONLY), lalu mencoba banyak kombinasi rumus dan melapor
mana yang menghasilkan hash yang sama. Password hanya ada di proses ini (diketik tersembunyi / env),
tidak ditampilkan, tidak dikirim ke mana pun.

Pakai (dari root repo, DB di .env = production; butuh VPN):
    python tools/legacy_password_probe.py roy
    LEGACY_PROBE_PASSWORD=... python tools/legacy_password_probe.py roy      # non-interaktif
Setelah ketemu, rumus yang cocok dipindah ke apps/api/src/auth/password.ts (verifyLegacyPassword).
"""
import hashlib
import os
import sys
from getpass import getpass

sys.path.insert(0, os.path.dirname(__file__))
from db import connect  # koneksi READ ONLY yang sama dengan tools/db.py

ENCODINGS = ["utf-8", "utf-16-le", "utf-16-be", "ascii"]
HASHES = {"sha256": hashlib.sha256, "sha1": hashlib.sha1, "md5": hashlib.md5, "sha512": hashlib.sha512}


def salt_forms(salt: str):
    """Berbagai cara salt dipakai: sebagai string apa adanya, huruf kecil/besar, atau byte dari hex."""
    forms = {"str": salt, "str.lower": salt.lower(), "str.upper": salt.upper()}
    try:
        forms["hexbytes"] = bytes.fromhex(salt)  # 64 hex -> 32 byte
    except ValueError:
        pass
    return forms


def digest_hex(func, data: bytes) -> str:
    return func(data).hexdigest()


def candidates(password: str, salt: str):
    """Hasilkan (deskripsi, hash_hex_lower) untuk tiap kombinasi rumus yang masuk akal."""
    out = []
    for hname, hfunc in HASHES.items():
        for enc in ENCODINGS:
            try:
                pwd_b = password.encode(enc)
            except UnicodeEncodeError:
                continue
            # password saja (tanpa salt)
            out.append((f"{hname}(pwd[{enc}])", digest_hex(hfunc, pwd_b)))
            for sname, sform in salt_forms(salt).items():
                salt_b = sform if isinstance(sform, bytes) else sform.encode(enc)
                out.append((f"{hname}(salt[{sname}]+pwd[{enc}])", digest_hex(hfunc, salt_b + pwd_b)))
                out.append((f"{hname}(pwd[{enc}]+salt[{sname}])", digest_hex(hfunc, pwd_b + salt_b)))
    # varian hash bertingkat yang umum: hash(salt + hash(pwd)) dan hash(hash(pwd) + salt)
    for sname, sform in salt_forms(salt).items():
        for enc in ENCODINGS:
            try:
                inner = hashlib.sha256(password.encode(enc)).hexdigest()
            except UnicodeEncodeError:
                continue
            salt_s = sform.decode("latin-1") if isinstance(sform, bytes) else sform
            out.append((f"sha256(salt[{sname}]+sha256hex(pwd[{enc}]))", hashlib.sha256((salt_s + inner).encode("utf-8")).hexdigest()))
            out.append((f"sha256(sha256hex(pwd[{enc}])+salt[{sname}])", hashlib.sha256((inner + salt_s).encode("utf-8")).hexdigest()))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not args:
        sys.exit("Pakai: python tools/legacy_password_probe.py <username>")
    username = args[0]
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT UsersId, UsersUsername, UsersSalt, UsersHashedPassword FROM users WHERE UsersUsername=%s",
                (username,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        sys.exit(f"User {username} tidak ada.")
    salt = (row["UsersSalt"] or "").strip()
    target = (row["UsersHashedPassword"] or "").strip().lower()
    print(f"User {row['UsersUsername']} (#{row['UsersId']}): salt {len(salt)} hex, hash {len(target)} hex.")
    if salt.lower() == "bcrypt":
        sys.exit("User ini sudah bcrypt; tidak perlu probe.")

    password = os.environ.get("LEGACY_PROBE_PASSWORD") or getpass(f"Password {username} yang kamu tahu (tidak ditampilkan): ")
    if not password:
        sys.exit("Password kosong.")

    cands = candidates(password, salt)
    matches = [desc for desc, h in cands if h == target]
    print(f"Dicoba {len(cands)} kombinasi rumus.")
    if matches:
        print("COCOK:")
        for m in matches:
            print(f"  - {m}")
        print("\nPindahkan rumus ini ke apps/api/src/auth/password.ts (verifyLegacyPassword).")
    else:
        print("Tidak ada yang cocok. Kemungkinan GeneXus memakai iterasi (PBKDF2) atau pra-proses lain;")
        print("kirim hasil ini, nanti kombinasi diperluas (mis. PBKDF2-HMAC, normalisasi Unicode, pepper).")


if __name__ == "__main__":
    main()
