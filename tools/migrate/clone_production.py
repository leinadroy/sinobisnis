"""Salin struktur + data database production `sinobisnis` (10.10.3.23) ke MariaDB lokal.

Production hanya DIBACA lewat tools/db.py (satu SELECT per panggilan, sesi READ ONLY). Struktur tabel disusun ulang
dari information_schema (guard menolak SHOW CREATE). Database lokal ditulis dengan kredensial LOCAL_DB_* di .env root.

    python tools/migrate/clone_production.py all            # struktur + data (tanpa isi blob)
    python tools/migrate/clone_production.py all --replace  # hapus & buat ulang database lokal
    python tools/migrate/clone_production.py verify         # bandingkan jumlah baris production vs lokal

Isi blob lampiran (attachment.AttachmentBlob, invoiceattachment.InvoiceAttachmentBlob, ~10 GB) tidak disalin;
kolomnya diisi NULL / kosong. usercookies (token sesi login production) hanya disalin strukturnya.

Target staging (server bersama, STAGING_DB_* di .env root; nama database wajib mengandung "staging"):

    python tools/migrate/clone_production.py all --target staging --replace --blob-latest 10

--blob-latest N: tabel lampiran diisi sebagian, lengkap dengan isi file: N attachment terbaru, lampiran N invoiceattachment
terbaru diperluas ke seluruh invoice-nya, plus semua file yang dirujuknya (supaya PDF Invoice + Lampiran lengkap).
Isi ulang tabel lampiran saja:  python tools/migrate/clone_production.py blobs --target staging --blob-latest 10
Tambah lampiran semua invoice di rentang tanggal (beserta file rujukannya; tidak menghapus yang sudah ada):
    python tools/migrate/clone_production.py invoice-attachments --target staging --from 2026-10-01 --to 2026-11-30
Target MySQL 8 didukung (charset utf8 -> utf8mb3, tanpa DEFAULT NULL di kolom blob).
"""
import argparse
import os
import sys
import time
from pathlib import Path

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from db import _load_env, query  # noqa: E402  (helper read-only project)

SCHEMA = "sinobisnis"
SKIP_DATA = {"usercookies"}
BLOB_TYPES = {"blob", "longblob", "mediumblob", "tinyblob"}
BLOB_TABLES = ("attachment", "invoiceattachment")
CHUNK = 5000


def my_cs(name, mysql):
    """MySQL 8: charset utf8 (alias lama) ditulis utf8mb3 supaya tidak ada peringatan; MariaDB apa adanya."""
    if not mysql or not name:
        return name
    return "utf8mb3" + name[4:] if name == "utf8" or name.startswith("utf8_") else name


def q(name):
    return "`" + name.replace("`", "``") + "`"


def build_ddl(mysql=False):
    """CREATE TABLE per tabel dari information_schema production (tanpa foreign key; ditambahkan terpisah)."""
    tables = query("SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, AUTO_INCREMENT, TABLE_COMMENT FROM information_schema.tables "
                   "WHERE table_schema = %s AND table_type = 'BASE TABLE' ORDER BY TABLE_NAME", (SCHEMA,))
    cols = query("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, "
                 "COLUMN_COMMENT, ORDINAL_POSITION FROM information_schema.columns WHERE table_schema = %s ORDER BY TABLE_NAME, ORDINAL_POSITION", (SCHEMA,))
    idx = query("SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, INDEX_TYPE FROM information_schema.statistics "
                "WHERE table_schema = %s ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX", (SCHEMA,))
    fks = query("SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, k.ORDINAL_POSITION, "
                "r.UPDATE_RULE, r.DELETE_RULE FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r "
                "ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME "
                "WHERE k.TABLE_SCHEMA = %s AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION", (SCHEMA,))
    schema = query("SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS co FROM information_schema.schemata WHERE schema_name = %s", (SCHEMA,))[0]

    creates, meta = {}, {}
    for t in tables:
        name = t["TABLE_NAME"]
        tcols = [c for c in cols if c["TABLE_NAME"] == name]
        lines = []
        for c in tcols:
            ln = f"  {q(c['COLUMN_NAME'])} {c['COLUMN_TYPE']}"
            if c["CHARACTER_SET_NAME"]:
                ln += f" CHARACTER SET {my_cs(c['CHARACTER_SET_NAME'], mysql)} COLLATE {my_cs(c['COLLATION_NAME'], mysql)}"
            ln += " NOT NULL" if c["IS_NULLABLE"] == "NO" else " NULL"
            is_blob = c["COLUMN_TYPE"].split("(")[0].lower() in BLOB_TYPES
            # MariaDB 10.4: COLUMN_DEFAULT sudah berupa ekspresi SQL ('NULL', 'abc' dikutip, current_timestamp()).
            # MySQL 8 menolak DEFAULT literal di kolom blob; tanpa klausa hasilnya sama (NULL).
            if c["COLUMN_DEFAULT"] is not None and not (mysql and is_blob):
                ln += f" DEFAULT {c['COLUMN_DEFAULT']}"
            if c["EXTRA"]:
                ln += f" {c['EXTRA']}"
            if c["COLUMN_COMMENT"]:
                ln += " COMMENT " + pymysql.converters.escape_string(c["COLUMN_COMMENT"]).join("''")
            lines.append(ln)
        groups = {}
        for i in (x for x in idx if x["TABLE_NAME"] == name):
            groups.setdefault(i["INDEX_NAME"], []).append(i)
        for iname, parts in groups.items():
            cols_sql = ", ".join(q(p["COLUMN_NAME"]) + (f"({p['SUB_PART']})" if p["SUB_PART"] else "") for p in parts)
            if iname == "PRIMARY":
                lines.append(f"  PRIMARY KEY ({cols_sql})")
            elif parts[0]["INDEX_TYPE"] == "FULLTEXT":
                lines.append(f"  FULLTEXT KEY {q(iname)} ({cols_sql})")
            else:
                lines.append(f"  {'UNIQUE ' if not parts[0]['NON_UNIQUE'] else ''}KEY {q(iname)} ({cols_sql})")
        coll = t["TABLE_COLLATION"] or schema["co"]
        coll = my_cs(coll, mysql)
        creates[name] = (f"CREATE TABLE {q(name)} (\n" + ",\n".join(lines) + f"\n) ENGINE={t['ENGINE']} DEFAULT CHARSET={coll.split('_')[0]} COLLATE={coll}"
                         + (f" AUTO_INCREMENT={t['AUTO_INCREMENT']}" if t["AUTO_INCREMENT"] else ""))
        pk = [p["COLUMN_NAME"] for p in groups.get("PRIMARY", [])]
        meta[name] = {"cols": tcols, "pk": pk}

    fk_sql, fkg = [], {}
    for f in fks:
        fkg.setdefault((f["TABLE_NAME"], f["CONSTRAINT_NAME"]), []).append(f)
    for (tname, cname), parts in fkg.items():
        # Tanpa klausa = RESTRICT (seperti production); klausa eksplisit RESTRICT dilaporkan MariaDB sebagai NO ACTION.
        rules = "".join(f" ON {k} {parts[0][f'{k}_RULE']}" for k in ("DELETE", "UPDATE") if parts[0][f"{k}_RULE"] != "RESTRICT")
        fk_sql.append(f"ALTER TABLE {q(tname)} ADD CONSTRAINT {q(cname)} FOREIGN KEY ({', '.join(q(p['COLUMN_NAME']) for p in parts)}) "
                      f"REFERENCES {q(parts[0]['REFERENCED_TABLE_NAME'])} ({', '.join(q(p['REFERENCED_COLUMN_NAME']) for p in parts)}){rules}")
    return schema, creates, fk_sql, meta


def local(db=None):
    _load_env()
    return pymysql.connect(host=os.environ.get("LOCAL_DB_HOST", "127.0.0.1"), port=int(os.environ.get("LOCAL_DB_PORT", 3306)),
                           user=os.environ["LOCAL_DB_USER"], password=os.environ["LOCAL_DB_PASS"], database=db, charset="utf8mb4",
                           autocommit=False, local_infile=False)


def target_name():
    _load_env()
    name = os.environ.get("LOCAL_DB_NAME", SCHEMA)
    if os.environ.get("LOCAL_DB_HOST", "127.0.0.1") not in ("127.0.0.1", "localhost", "::1"):
        sys.exit("LOCAL_DB_HOST harus localhost; script ini tidak menulis ke server lain.")
    return name


class Target:
    """Database tujuan: lokal (LOCAL_DB_*) atau staging (STAGING_DB_*). Production tidak pernah jadi tujuan."""

    def __init__(self, kind):
        _load_env()
        e = os.environ
        self.kind = kind
        if kind == "local":
            self.name, self.label = target_name(), "lokal"
            self._cfg = dict(host=e.get("LOCAL_DB_HOST", "127.0.0.1"), port=int(e.get("LOCAL_DB_PORT", 3306)),
                             user=e["LOCAL_DB_USER"], password=e["LOCAL_DB_PASS"])
        else:
            missing = [k for k in ("STAGING_DB_HOST", "STAGING_DB_USER", "STAGING_DB_PASS", "STAGING_DB_NAME") if not e.get(k)]
            if missing:
                sys.exit(f"Isi {', '.join(missing)} di .env root.")
            self.name, self.label = e["STAGING_DB_NAME"], f"staging {e['STAGING_DB_HOST']}"
            self._cfg = dict(host=e["STAGING_DB_HOST"], port=int(e.get("STAGING_DB_PORT", 3306)),
                             user=e["STAGING_DB_USER"], password=e["STAGING_DB_PASS"])
            # Pengaman: server staging berisi banyak database lain, dan production tidak boleh ditulis.
            if self._cfg["host"] == e.get("DB_HOST"):
                sys.exit("STAGING_DB_HOST sama dengan host production; dibatalkan.")
            if "staging" not in self.name.lower():
                sys.exit(f"Nama database staging harus mengandung 'staging' (sekarang: {self.name}); dibatalkan.")
        with self.connect() as c, c.cursor() as cur:
            cur.execute("SELECT VERSION()")
            self.version = cur.fetchone()[0]
        self.mysql = "mariadb" not in self.version.lower()

    def connect(self, db=None):
        return pymysql.connect(**self._cfg, database=db, charset="utf8mb4", autocommit=False, local_infile=False,
                               connect_timeout=15, read_timeout=600, write_timeout=600)


def create(target, schema, creates, fk_sql, replace):
    name = target.name
    conn = target.connect()
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s", (name,))
        existing = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = %s", (name,))
        exists = cur.fetchone()[0]
        if exists and existing and not replace:
            sys.exit(f"Database {target.label} {name} sudah berisi {existing} tabel. Pakai --replace untuk membuat ulang.")
        if exists:
            cur.execute(f"DROP DATABASE {q(name)}")
        cur.execute(f"CREATE DATABASE {q(name)} CHARACTER SET {my_cs(schema['cs'], target.mysql)} COLLATE {my_cs(schema['co'], target.mysql)}")
        cur.execute(f"USE {q(name)}")
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for t, sql in creates.items():
            cur.execute(sql)
        for sql in fk_sql:
            cur.execute(sql)
    conn.commit()
    conn.close()
    print(f"Database {target.label} {name} ({target.version}): {len(creates)} tabel, {len(fk_sql)} foreign key.")


def has_blob(m):
    return any(c["COLUMN_TYPE"].split("(")[0].lower() in BLOB_TYPES for c in m["cols"])


def copy_data(target, meta, blob_latest=None):
    conn = target.connect(target.name)
    total_start = time.time()
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        cur.execute("SET UNIQUE_CHECKS = 0")
        # Baris placeholder ber-id 0 (mis. billto 0 "== Please Select ==") harus tetap 0; tanpa mode ini kolom
        # AUTO_INCREMENT mengganti 0 dengan id berikutnya (dulu jadi billto 267, 145 invoice kehilangan rujukannya).
        cur.execute("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')")
        for t, m in meta.items():
            if t in SKIP_DATA:
                print(f"  {t:22s} (struktur saja)")
                continue
            start = time.time()
            insert_cols = [q(c["COLUMN_NAME"]) for c in m["cols"]]
            ins = f"INSERT INTO {q(t)} ({', '.join(insert_cols)}) VALUES ({', '.join(['%s'] * len(insert_cols))})"
            pk = m["pk"]
            if blob_latest and t in BLOB_TABLES:
                continue  # diisi copy_blob_tables() setelah tabel lain
            select_cols = []
            for c in m["cols"]:
                base = c["COLUMN_TYPE"].split("(")[0].lower()
                if base in BLOB_TYPES:
                    select_cols.append("NULL" if c["IS_NULLABLE"] == "YES" else "''")
                else:
                    select_cols.append(q(c["COLUMN_NAME"]))
            sel = ", ".join(select_cols)
            n = 0
            if len(pk) == 1:
                b = query(f"SELECT MIN({q(pk[0])}) AS lo, MAX({q(pk[0])}) AS hi FROM {q(t)}")[0]
                if b["lo"] is not None and isinstance(b["lo"], int):
                    lo = b["lo"]
                    while lo <= b["hi"]:
                        rows = query(f"SELECT {sel} FROM {q(t)} WHERE {q(pk[0])} BETWEEN %s AND %s", (lo, lo + CHUNK - 1))
                        if rows:
                            cur.executemany(ins, [tuple(r.values()) for r in rows])
                            n += len(rows)
                        lo += CHUNK
                    conn.commit()
                    print(f"  {t:22s} {n:>8} baris ({time.time() - start:.1f}s)")
                    continue
            rows = query(f"SELECT {sel} FROM {q(t)}")
            if rows:
                cur.executemany(ins, [tuple(r.values()) for r in rows])
                n = len(rows)
            conn.commit()
            print(f"  {t:22s} {n:>8} baris ({time.time() - start:.1f}s)")
        if blob_latest:
            copy_blob_tables(conn, cur, meta, blob_latest)
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.close()
    print(f"Data selesai ({time.time() - total_start:.0f}s).")


def copy_blob_tables(conn, cur, meta, n):
    """Tabel lampiran (dengan isi file), dibatasi tapi tetap utuh untuk dicetak:
    - attachment: N baris terbaru;
    - invoiceattachment: N baris terbaru, diperluas ke SEMUA lampiran invoice yang sama (invoice tidak setengah);
    - attachment tambahan: semua file yang dirujuk invoiceattachment tersalin (InvoiceAttachmentIdInvoice),
      supaya "PDF Invoice + Lampiran" lengkap.
    Baris diambil satu per satu dari production (WHERE + LIMIT, sesuai aturan tabel blob)."""
    def put(t, ids):
        cols = [q(c["COLUMN_NAME"]) for c in meta[t]["cols"]]
        pk = q(meta[t]["pk"][0])
        ins = f"INSERT INTO {q(t)} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
        size = 0
        for i in ids:
            rows = query(f"SELECT {', '.join(cols)} FROM {q(t)} WHERE {pk} = %s LIMIT 1", (i,))
            if rows:
                cur.execute(ins, tuple(rows[0].values()))
                size += sum(len(v) for v in rows[0].values() if isinstance(v, (bytes, bytearray)))
        conn.commit()
        return size

    start = time.time()
    att = [r["id"] for r in query(f"SELECT AttachmentId AS id FROM attachment ORDER BY AttachmentId DESC LIMIT {int(n)}")]
    newest = query(f"SELECT InvoiceAttachmentId AS id, InvoiceAttachmentInvoiceId AS inv FROM invoiceattachment "
                   f"ORDER BY InvoiceAttachmentId DESC LIMIT {int(n)}")
    invoices = sorted({r["inv"] for r in newest})
    ia = query(f"SELECT InvoiceAttachmentId AS id, InvoiceAttachmentIdInvoice AS ref FROM invoiceattachment "
               f"WHERE InvoiceAttachmentInvoiceId IN ({', '.join(['%s'] * len(invoices))}) LIMIT 10000", tuple(invoices)) if invoices else []
    refs = {r["ref"] for r in ia if r["ref"]} - set(att)
    s_ia = put("invoiceattachment", [r["id"] for r in ia])
    s_att = put("attachment", sorted(set(att) | refs))
    print(f"  {'invoiceattachment':22s} {len(ia):>8} baris (lampiran lengkap invoice {', '.join(map(str, invoices))}) + isi file {s_ia / 1048576:.1f} MB")
    print(f"  {'attachment':22s} {len(att) + len(refs):>8} baris ({len(att)} terbaru + {len(refs)} file rujukan invoice) "
          f"+ isi file {s_att / 1048576:.1f} MB ({time.time() - start:.1f}s)")


def add_invoice_attachments(target, meta, date_from, date_to):
    """Lengkapi lampiran semua invoice dengan InvoiceDate di rentang ini (beserta file yang dirujuk), dari production.
    Hanya menambah baris yang belum ada di tujuan; lampiran lain tidak dihapus. Bisa dijalankan ulang (lanjut otomatis)."""
    conn = target.connect(target.name)
    start = time.time()
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        cur.execute("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')")
        invoices = [r["id"] for r in query("SELECT InvoiceId AS id FROM invoice WHERE InvoiceDate BETWEEN %s AND %s ORDER BY InvoiceId",
                                           (date_from, date_to))]
        if not invoices:
            print(f"Tidak ada invoice bertanggal {date_from} s/d {date_to}.")
            return
        marks = ", ".join(["%s"] * len(invoices))
        ia = query(f"SELECT InvoiceAttachmentId AS id, InvoiceAttachmentInvoiceId AS inv, InvoiceAttachmentIdInvoice AS ref "
                   f"FROM invoiceattachment WHERE InvoiceAttachmentInvoiceId IN ({marks}) LIMIT 100000", tuple(invoices))
        cur.execute("SELECT InvoiceAttachmentId FROM invoiceattachment")
        have_ia = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT AttachmentId FROM attachment")
        have_att = {r[0] for r in cur.fetchall()}
        need_ia = [r["id"] for r in ia if r["id"] not in have_ia]
        need_att = sorted({r["ref"] for r in ia if r["ref"]} - have_att)
        print(f"Invoice {date_from} s/d {date_to}: {len(invoices)} invoice, {len({r['inv'] for r in ia})} punya lampiran, "
              f"{len(ia)} baris lampiran ({len(need_ia)} belum ada), {len({r['ref'] for r in ia if r['ref']})} file rujukan "
              f"({len(need_att)} belum ada).")

        def put(t, ids, label):
            cols = [q(c["COLUMN_NAME"]) for c in meta[t]["cols"]]
            pk = q(meta[t]["pk"][0])
            ins = f"INSERT INTO {q(t)} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
            size, t0 = 0, time.time()
            for k, i in enumerate(ids, 1):
                rows = query(f"SELECT {', '.join(cols)} FROM {q(t)} WHERE {pk} = %s LIMIT 1", (i,))
                if rows:
                    cur.execute(ins, tuple(rows[0].values()))
                    size += sum(len(v) for v in rows[0].values() if isinstance(v, (bytes, bytearray)))
                if k % 50 == 0 or k == len(ids):
                    conn.commit()
                    print(f"  {label}: {k}/{len(ids)} ({size / 1048576:.0f} MB, {time.time() - t0:.0f}s)", flush=True)
            conn.commit()
            return size

        put("invoiceattachment", need_ia, "lampiran invoice")
        put("attachment", need_att, "file lampiran")
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.close()
    print(f"Selesai ({time.time() - start:.0f}s).")


def check_invoice_attachments(target, date_from, date_to):
    """Bandingkan per invoice: jumlah lampiran & total ukuran file tujuan vs production."""
    invoices = query("SELECT InvoiceId AS id, InvoiceNo AS no FROM invoice WHERE InvoiceDate BETWEEN %s AND %s ORDER BY InvoiceId", (date_from, date_to))
    if not invoices:
        return
    marks = ", ".join(["%s"] * len(invoices))
    ids = tuple(r["id"] for r in invoices)
    sql = (f"SELECT ia.InvoiceAttachmentInvoiceId AS inv, COUNT(*) AS n, SUM(COALESCE(LENGTH(ia.InvoiceAttachmentBlob), 0) + "
           f"COALESCE(LENGTH(a.AttachmentBlob), 0)) AS bytes, SUM(ia.InvoiceAttachmentIdInvoice > 0 AND a.AttachmentId IS NULL) AS hilang "
           f"FROM invoiceattachment ia LEFT JOIN attachment a ON a.AttachmentId = ia.InvoiceAttachmentIdInvoice "
           f"WHERE ia.InvoiceAttachmentInvoiceId IN ({marks}) GROUP BY ia.InvoiceAttachmentInvoiceId")
    prod = {r["inv"]: r for r in query(sql + " LIMIT 100000", ids)}
    conn = target.connect(target.name)
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(sql, ids)
        tgt = {r["inv"]: r for r in cur.fetchall()}
    conn.close()
    bad = [r for r in invoices if r["id"] in prod and (
        r["id"] not in tgt or tgt[r["id"]]["n"] != prod[r["id"]]["n"] or int(tgt[r["id"]]["bytes"] or 0) != int(prod[r["id"]]["bytes"] or 0)
        or int(tgt[r["id"]]["hilang"] or 0) > 0)]
    total = sum(int(r["bytes"] or 0) for r in prod.values())
    print(f"{'OK  ' if not bad else 'BEDA'} lampiran invoice {date_from} s/d {date_to}: {len(prod) - len(bad)}/{len(prod)} invoice lengkap "
          f"({sum(r['n'] for r in prod.values())} lampiran, {total / 1048576:.0f} MB, isi file sama dengan production)")
    for r in bad[:20]:
        print(f"     belum lengkap: {r['id']} {r['no']}")


def refill_blobs(target, meta, n):
    """Isi ulang hanya tabel lampiran di database tujuan (tanpa menyalin ulang tabel lain)."""
    conn = target.connect(target.name)
    with conn.cursor() as cur:
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        cur.execute("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')")
        for t in BLOB_TABLES:
            cur.execute(f"DELETE FROM {q(t)}")
        conn.commit()
        copy_blob_tables(conn, cur, meta, n)
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.close()


def verify(target, meta, blob_latest=None):
    conn = target.connect(target.name)
    diff = 0
    with conn.cursor() as cur:
        for t, m in meta.items():
            prod = query(f"SELECT COUNT(*) AS n FROM {q(t)}")[0]["n"]
            cur.execute(f"SELECT COUNT(*) FROM {q(t)}")
            loc = cur.fetchone()[0]
            partial = bool(blob_latest and t in BLOB_TABLES)
            want = 0 if t in SKIP_DATA else prod
            good = (loc >= min(prod, int(blob_latest))) if partial else loc == want
            flag = "OK  " if good else "BEDA"
            if not good:
                diff += 1
            note = "  (struktur saja)" if t in SKIP_DATA else "  (sebagian, dengan isi file)" if partial else ""
            print(f"{flag} {t:22s} production {prod:>8}  {target.kind} {loc:>8}{note}")
        if blob_latest:
            cur.execute("SELECT COUNT(*) FROM invoiceattachment ia LEFT JOIN attachment a ON a.AttachmentId = ia.InvoiceAttachmentIdInvoice "
                        "WHERE ia.InvoiceAttachmentIdInvoice > 0 AND a.AttachmentId IS NULL")
            broken = cur.fetchone()[0]
            print(("OK  " if not broken else "BEDA") + f" rujukan lampiran invoice -> attachment: {broken} hilang")
            diff += 1 if broken else 0
    conn.close()
    print("Semua tabel cocok." if not diff else f"{diff} tabel berbeda (production terus berubah; jalankan ulang bila perlu).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["all", "structure", "verify", "blobs", "invoice-attachments"])
    ap.add_argument("--replace", action="store_true", help="hapus database tujuan yang sudah ada")
    ap.add_argument("--target", choices=["local", "staging"], default="local", help="lokal (LOCAL_DB_*) atau staging (STAGING_DB_*)")
    ap.add_argument("--blob-latest", type=int, default=None, help="tabel ber-blob: salin N baris terbaru lengkap dengan isi file")
    ap.add_argument("--from", dest="date_from", help="invoice-attachments: tanggal invoice awal (YYYY-MM-DD)")
    ap.add_argument("--to", dest="date_to", help="invoice-attachments: tanggal invoice akhir (YYYY-MM-DD)")
    a = ap.parse_args()
    target = Target(a.target)
    schema, creates, fk_sql, meta = build_ddl(mysql=target.mysql)
    if a.what in ("all", "structure"):
        create(target, schema, creates, fk_sql, a.replace)
    if a.what == "all":
        copy_data(target, meta, a.blob_latest)
    if a.what == "invoice-attachments":
        if not (a.date_from and a.date_to):
            sys.exit("invoice-attachments butuh --from YYYY-MM-DD --to YYYY-MM-DD.")
        add_invoice_attachments(target, meta, a.date_from, a.date_to)
        check_invoice_attachments(target, a.date_from, a.date_to)
        return
    if a.what == "blobs":
        if not a.blob_latest:
            sys.exit("Perintah blobs butuh --blob-latest N.")
        refill_blobs(target, meta, a.blob_latest)
    if a.what in ("all", "verify", "blobs"):
        verify(target, meta, a.blob_latest)


if __name__ == "__main__":
    main()
