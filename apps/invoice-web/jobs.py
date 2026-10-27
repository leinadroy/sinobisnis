"""Background invoice jobs.

Each request runs invoiceprint.service.process() in a worker thread and
writes into data/jobs/<job_id>/. Results (they contain passports and other
personal documents) are deleted automatically after JOB_TTL_HOURS.
"""
import os
import secrets
import shutil
import threading
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from invoiceprint.service import process

JOBS_DIR = Path(__file__).resolve().parent / "data" / "jobs"
TTL_HOURS = float(os.environ.get("JOB_TTL_HOURS", "6"))
MAX_JOBS = int(os.environ.get("MAX_JOBS", "2"))


@dataclass
class Job:
    id: str
    owner: str
    key: str
    created: float = field(default_factory=time.time)
    status: str = "antri"  # antri | proses | selesai | gagal
    log: list = field(default_factory=list)
    done: int = 0
    total: int = 0
    invoice_no: str = ""
    files: dict = field(default_factory=dict)  # kind -> Path
    error: str = ""

    def public(self):
        return {"id": self.id, "key": self.key, "status": self.status, "log": self.log[-50:],
                "done": self.done, "total": self.total, "invoice_no": self.invoice_no,
                "files": {k: {"name": p.name, "size": p.stat().st_size}
                          for k, p in self.files.items() if p.exists()},
                "error": self.error,
                "expires": self.created + TTL_HOURS * 3600}


_jobs = {}
_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=MAX_JOBS, thread_name_prefix="invoice")


def submit(owner, key):
    job = Job(id=secrets.token_urlsafe(16), owner=owner, key=key.strip())
    with _lock:
        _jobs[job.id] = job
    _pool.submit(_run, job)
    return job


def get(job_id, owner):
    job = _jobs.get(job_id)
    return job if job and job.owner == owner else None


def recent(owner, limit=10):
    with _lock:
        mine = [j for j in _jobs.values() if j.owner == owner]
    return sorted(mine, key=lambda j: j.created, reverse=True)[:limit]


def _run(job):
    job.status = "proses"
    root = JOBS_DIR / job.id
    try:
        def log(t):
            if t.startswith("Selesai. Folder:"):  # don't show server paths to users
                t = "Selesai."
            job.log.append(t)
            if t.startswith("Invoice ") and not job.invoice_no:
                job.invoice_no = t.split()[1]

        def progress(d, n):
            job.done, job.total = d, n

        out = process(job.key, root, log=log, progress=progress)
        tag = out.name
        att = out / "attachments"
        zip_path = out / f"Attachments-{tag}.zip"
        log("Membuat ZIP lampiran...")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as z:  # PDFs are already compressed
            for f in sorted(att.iterdir()):
                z.write(f, f"attachments/{f.name}")
        job.files = {"invoice": out / f"Invoice-{tag}.pdf",
                     "merged": out / f"Invoice-{tag}-with-attachments.pdf",
                     "zip": zip_path}
        job.status = "selesai"
    except LookupError as e:
        job.status, job.error = "gagal", str(e)
    except Exception as e:  # noqa: BLE001 - shown to the user
        msg = str(e)
        if "Can't connect" in msg or "timed out" in msg:
            msg = "Server tidak bisa konek ke database (10.10.3.23). Hubungi IT."
        job.status, job.error = "gagal", msg
        job.log.append(f"ERROR: {e}")
        shutil.rmtree(root, ignore_errors=True)


def cleanup():
    """Delete job folders older than the TTL (also ones left from a restart)."""
    cutoff = time.time() - TTL_HOURS * 3600
    with _lock:
        for jid in [j for j, job in _jobs.items()
                    if job.created < cutoff and job.status in ("selesai", "gagal")]:
            del _jobs[jid]
    if JOBS_DIR.exists():
        for d in JOBS_DIR.iterdir():
            if d.is_dir() and d.stat().st_mtime < cutoff and d.name not in _jobs:
                shutil.rmtree(d, ignore_errors=True)


def start_cleanup_loop(interval=600):
    def loop():
        while True:
            try:
                cleanup()
            except Exception:
                pass
            time.sleep(interval)
    threading.Thread(target=loop, daemon=True, name="cleanup").start()
