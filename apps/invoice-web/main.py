"""SML Invoice Web — web version of the invoice printer, for the office server.

Login, type an invoice number, and download:
  - the invoice PDF (SML / RTS / JCSS model by prefix)
  - the invoice merged with all attachments
  - a ZIP of the attachments

The sinobisnis database is only read (see invoiceprint/db.py).
Run:  python main.py   (settings in .env)
"""
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from invoiceprint.db import _load_env

_load_env()  # .env must be loaded before jobs.py reads its settings

import uvicorn  # noqa: E402
from fastapi import FastAPI, Form, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from fastapi.templating import Jinja2Templates  # noqa: E402
from starlette.middleware.sessions import SessionMiddleware  # noqa: E402

import auth  # noqa: E402
import jobs  # noqa: E402

BASE = Path(__file__).resolve().parent
SECRET_KEY = os.environ.get("SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise SystemExit("SECRET_KEY di .env belum diisi (min 32 karakter). "
                     "Buat dengan: python -c \"import secrets;print(secrets.token_urlsafe(48))\"")

@asynccontextmanager
async def lifespan(app):
    jobs.JOBS_DIR.mkdir(parents=True, exist_ok=True)
    jobs.cleanup()
    jobs.start_cleanup_loop()
    yield


app = FastAPI(title="SML Invoice Web", docs_url=None, redoc_url=None, openapi_url=None,
              lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, same_site="strict",
                   https_only=os.environ.get("COOKIE_SECURE", "0") == "1",
                   max_age=12 * 3600, session_cookie="sml_invoice")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- helpers
def current_user(request):
    return request.session.get("user")


def csrf_token(request):
    if "csrf" not in request.session:
        request.session["csrf"] = secrets.token_urlsafe(24)
    return request.session["csrf"]


def check_csrf(request, token):
    if not token or not secrets.compare_digest(token, request.session.get("csrf", "")):
        raise HTTPException(400, "Sesi tidak valid, muat ulang halaman.")


def render(request, name, **ctx):
    ctx.update(request=request, user=current_user(request),
               fullname=request.session.get("fullname"), csrf=csrf_token(request))
    return templates.TemplateResponse(request, name, ctx)


def client_ip(request):
    return request.client.host if request.client else ""


# ---------------------------------------------------------------- auth
@app.get("/login")
def login_page(request: Request):
    if current_user(request):
        return RedirectResponse("/", 303)
    return render(request, "login.html", error=None)


@app.post("/login")
def login(request: Request, username: str = Form(...), password: str = Form(...),
          csrf: str = Form("")):
    check_csrf(request, csrf)
    username = username.strip()
    name = auth.check(username, password, client_ip(request))
    if not name:
        msg = ("Terlalu banyak percobaan gagal. Coba lagi 5 menit lagi."
               if auth.is_locked(username, client_ip(request)) else "Username atau password salah.")
        return render(request, "login.html", error=msg, username=username)
    request.session.clear()
    request.session.update(user=username, fullname=name, csrf=secrets.token_urlsafe(24))
    return RedirectResponse("/", 303)


@app.post("/logout")
def logout(request: Request, csrf: str = Form("")):
    check_csrf(request, csrf)
    request.session.clear()
    return RedirectResponse("/login", 303)


# ---------------------------------------------------------------- pages
@app.get("/")
def home(request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", 303)
    return render(request, "index.html", recent=jobs.recent(user), ttl=jobs.TTL_HOURS)


@app.post("/jobs")
def create_job(request: Request, invoice: str = Form(...), csrf: str = Form("")):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", 303)
    check_csrf(request, csrf)
    if not invoice.strip():
        return RedirectResponse("/", 303)
    job = jobs.submit(user, invoice)
    return RedirectResponse(f"/jobs/{job.id}", 303)


@app.get("/jobs/{job_id}")
def job_page(request: Request, job_id: str):
    user = current_user(request)
    if not user:
        return RedirectResponse("/login", 303)
    job = jobs.get(job_id, user)
    if not job:
        raise HTTPException(404, "Proses tidak ditemukan atau sudah kedaluwarsa.")
    return render(request, "job.html", job=job, ttl=jobs.TTL_HOURS)


@app.get("/api/jobs/{job_id}")
def job_status(request: Request, job_id: str):
    user = current_user(request)
    job = jobs.get(job_id, user) if user else None
    if not job:
        return JSONResponse({"error": "not found"}, 404)
    return job.public()


@app.get("/jobs/{job_id}/download/{kind}")
def download(request: Request, job_id: str, kind: str):
    user = current_user(request)
    job = jobs.get(job_id, user) if user else None
    if not job or kind not in job.files or not job.files[kind].exists():
        raise HTTPException(404, "File tidak ditemukan atau sudah dihapus.")
    path = job.files[kind]
    media = "application/zip" if path.suffix == ".zip" else "application/pdf"
    return FileResponse(path, media_type=media, filename=path.name)


@app.get("/healthz")
def health():
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run("main:app", host=os.environ.get("HOST", "0.0.0.0"),
                port=int(os.environ.get("PORT", "8000")),
                ssl_certfile=os.environ.get("SSL_CERTFILE") or None,
                ssl_keyfile=os.environ.get("SSL_KEYFILE") or None,
                proxy_headers=True, forwarded_allow_ips=os.environ.get("TRUSTED_PROXIES", "127.0.0.1"))
