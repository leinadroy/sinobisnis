"""Salin struktur + data database production `sinobisnis` (10.10.3.23) ke MariaDB lokal.

Production hanya DIBACA lewat tools/db.py (satu SELECT per panggilan, sesi READ ONLY). Struktur tabel disusun ulang
dari information_schema (guard menolak SHOW CREATE). Database lokal ditulis dengan kredensial LOCAL_DB_* di .env root.

    python tools/migrate/clone_production.py all            # struktur + data (tanpa isi blob)
    python tools/migrate/clone_production.py all --replace  # hapus & buat ulang database lokal
    python tools/migrate/clone_production.py verify         # bandingkan jumlah baris production vs lokal

Isi blob lampiran (attachment.AttachmentBlob, invoiceattachment.InvoiceAttachmentBlob, ~10 GB) tidak disalin;
kolomnya diisi NULL / kosong. usercookies (token sesi login production) hanya disalin strukturnya.
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
CHUNK = 5000


def q(name):
    return "`" + name.replace("`", "``") + "`"


def build_ddl():
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
                ln += f" CHARACTER SET {c['CHARACTER_SET_NAME']} COLLATE {c['COLLATION_NAME']}"
            ln += " NOT NULL" if c["IS_NULLABLE"] == "NO" else " NULL"
            # MariaDB 10.4: COLUMN_DEFAULT sudah berupa ekspresi SQL ('NULL', 'abc' dikutip, current_timestamp()).
            if c["COLUMN_DEFAULT"] is not None:
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


def create(schema, creates, fk_sql, replace):
    name = target_name()
    conn = local()
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s", (name,))
        existing = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = %s", (name,))
        exists = cur.fetchone()[0]
        if exists and existing and not replace:
            sys.exit(f"Database lokal {name} sudah berisi {existing} tabel. Pakai --replace untuk membuat ulang.")
        if exists:
            cur.execute(f"DROP DATABASE {q(name)}")
        cur.execute(f"CREATE DATABASE {q(name)} CHARACTER SET {schema['cs']} COLLATE {schema['co']}")
        cur.execute(f"USE {q(name)}")
        cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for t, sql in creates.items():
            cur.execute(sql)
        for sql in fk_sql:
            cur.execute(sql)
    conn.commit()
    conn.close()
    print(f"Database lokal {name}: {len(creates)} tabel, {len(fk_sql)} foreign key.")


def copy_data(meta):
    name = target_name()
    conn = local(name)
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
            select_cols, insert_cols = [], []
            for c in m["cols"]:
                insert_cols.append(q(c["COLUMN_NAME"]))
                base = c["COLUMN_TYPE"].split("(")[0].lower()
                if base in BLOB_TYPES:
                    select_cols.append("NULL" if c["IS_NULLABLE"] == "YES" else "''")
                else:
                    select_cols.append(q(c["COLUMN_NAME"]))
            sel = ", ".join(select_cols)
            ins = f"INSERT INTO {q(t)} ({', '.join(insert_cols)}) VALUES ({', '.join(['%s'] * len(insert_cols))})"
            pk = m["pk"]
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
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.close()
    print(f"Data selesai ({time.time() - total_start:.0f}s).")


def verify(meta):
    name = target_name()
    conn = local(name)
    diff = 0
    with conn.cursor() as cur:
        for t in meta:
            prod = query(f"SELECT COUNT(*) AS n FROM {q(t)}")[0]["n"]
            cur.execute(f"SELECT COUNT(*) FROM {q(t)}")
            loc = cur.fetchone()[0]
            want = 0 if t in SKIP_DATA else prod
            flag = "OK  " if loc == want else "BEDA"
            if loc != want:
                diff += 1
            print(f"{flag} {t:22s} production {prod:>8}  lokal {loc:>8}{'  (struktur saja)' if t in SKIP_DATA else ''}")
    conn.close()
    print("Semua tabel cocok." if not diff else f"{diff} tabel berbeda (production terus berubah; jalankan ulang bila perlu).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["all", "structure", "verify"])
    ap.add_argument("--replace", action="store_true", help="hapus database lokal yang sudah ada")
    a = ap.parse_args()
    schema, creates, fk_sql, meta = build_ddl()
    if a.what in ("all", "structure"):
        create(schema, creates, fk_sql, a.replace)
    if a.what == "all":
        copy_data(meta)
    if a.what in ("all", "verify"):
        verify(meta)


if __name__ == "__main__":
    main()
