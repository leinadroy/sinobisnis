"""Read-only access to the sinobisnis MariaDB database.

The DB user (gxmysql) has full privileges on the server, so read-only is
enforced here, in two layers:
  1. Only one statement per call, and it must start with SELECT, SHOW,
     DESCRIBE/DESC, EXPLAIN or WITH (CTE ending in SELECT).
  2. The session is set to READ ONLY, so the server itself rejects any
     write that slips past the first check.

Credentials come from .env in the project root (never committed).

Usage as a library:
    from db import query
    rows = query("SELECT * FROM invoice WHERE id = %s", (123,))

Usage from the command line:
    python tools/db.py "SELECT COUNT(*) FROM invoice"
"""
import os
import re
import sys
from pathlib import Path

import pymysql
import pymysql.cursors

ROOT = Path(__file__).resolve().parent.parent
ALLOWED = re.compile(r"^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b", re.I)
# Blocked anywhere in the statement, after string literals and comments are stripped.
FORBIDDEN = re.compile(
    r"\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|"
    r"LOCK|UNLOCK|CALL|HANDLER|LOAD|SET|COMMIT|ROLLBACK|START|BEGIN|INTO\s+(OUT|DUM)FILE|"
    r"FOR\s+UPDATE|LOCK\s+IN\s+SHARE\s+MODE)\b",
    re.I,
)


class ReadOnlyError(Exception):
    pass


def _load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def _strip(sql):
    sql = re.sub(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|`[^`]*`", "''", sql)
    sql = re.sub(r"/\*.*?\*/|--[^\n]*|#[^\n]*", " ", sql, flags=re.S)
    return sql


def check_sql(sql):
    bare = _strip(sql).strip().rstrip(";").strip()
    if ";" in bare:
        raise ReadOnlyError("Only one statement per query is allowed.")
    if not ALLOWED.match(bare):
        raise ReadOnlyError("Only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH queries are allowed.")
    m = FORBIDDEN.search(bare)
    if m:
        raise ReadOnlyError(f"Keyword not allowed in read-only mode: {m.group(0).upper()}")


def connect():
    _load_env()
    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASS"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=120,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )
    with conn.cursor() as cur:
        cur.execute("SET SESSION TRANSACTION READ ONLY")
        cur.execute("SET SESSION max_statement_time = 120")
    return conn


def query(sql, params=None, limit=None):
    """Run one read-only statement and return a list of dict rows."""
    check_sql(sql)
    conn = connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchmany(limit) if limit else cur.fetchall()
    finally:
        conn.close()


def _print_rows(rows, max_width=60):
    if not rows:
        print("(no rows)")
        return
    cols = list(rows[0])
    cell = lambda v: ("NULL" if v is None else
                      f"<{len(v)} bytes>" if isinstance(v, (bytes, bytearray)) else
                      str(v).replace("\n", " "))[:max_width]
    widths = [max(len(c), *(len(cell(r[c])) for r in rows)) for c in cols]
    print(" | ".join(c.ljust(w) for c, w in zip(cols, widths)))
    print("-+-".join("-" * w for w in widths))
    for r in rows:
        print(" | ".join(cell(r[c]).ljust(w) for c, w in zip(cols, widths)))
    print(f"({len(rows)} rows)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('usage: python tools/db.py "SELECT ..." [max_rows=200]')
    try:
        _print_rows(query(sys.argv[1], limit=int(sys.argv[2]) if len(sys.argv) > 2 else 200))
    except ReadOnlyError as e:
        sys.exit(f"BLOCKED: {e}")
