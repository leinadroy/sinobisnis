"""App users for the web version.

Users live in data/users.json (not in the sinobisnis database, which stays
read-only). Passwords are stored as PBKDF2-SHA256 hashes. Manage them with
manage_users.py.
"""
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from pathlib import Path

USERS_FILE = Path(__file__).resolve().parent / "data" / "users.json"
ITERATIONS = 310_000
_lock = threading.Lock()

# simple brute-force protection: 5 failures -> 5 minute lock per username/IP
MAX_FAILS, LOCK_SECONDS = 5, 300
_fails = {}


def _load():
    if USERS_FILE.exists():
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    return {}


def _save(users):
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = USERS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(users, indent=2), encoding="utf-8")
    os.replace(tmp, USERS_FILE)


def _hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()


def set_password(username, password, fullname=None):
    if len(password) < 8:
        raise ValueError("Password minimal 8 karakter.")
    with _lock:
        users = _load()
        salt = secrets.token_hex(16)
        u = users.get(username, {})
        u.update({"salt": salt, "hash": _hash(password, salt),
                  "fullname": fullname or u.get("fullname") or username, "active": True})
        users[username] = u
        _save(users)


def remove(username):
    with _lock:
        users = _load()
        users.pop(username, None)
        _save(users)


def list_users():
    return {k: {"fullname": v.get("fullname"), "active": v.get("active", True)}
            for k, v in _load().items()}


def _locked(key):
    n, until = _fails.get(key, (0, 0))
    return until > time.time()


def check(username, password, client_ip=""):
    """Return the user's display name on success, None otherwise."""
    keys = (f"u:{username.lower()}", f"ip:{client_ip}")
    if any(_locked(k) for k in keys):
        return None
    u = _load().get(username)
    ok = bool(u and u.get("active", True)
              and hmac.compare_digest(_hash(password, u["salt"]), u["hash"]))
    for k in keys:
        if ok:
            _fails.pop(k, None)
        else:
            n, _ = _fails.get(k, (0, 0))
            n += 1
            _fails[k] = (n, time.time() + LOCK_SECONDS if n >= MAX_FAILS else 0)
    return (u.get("fullname") or username) if ok else None


def is_locked(username, client_ip=""):
    return _locked(f"u:{username.lower()}") or _locked(f"ip:{client_ip}")
