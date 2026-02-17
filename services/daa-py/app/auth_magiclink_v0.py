from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import DaaAuthLoginToken
from app.session import check_session, create_session, revoke_session, rotate_session_cookie, session_cookie_name
from app.util import (
    get_admin_emails,
    infer_role_from_email,
    is_production,
    is_reasonable_email,
    now_iso,
    normalize_email,
    secure_eq,
    sha256_hex,
)

# Legacy auth router kept for migration reference only.
# It must never claim the public /api/daa namespace.
router = APIRouter(prefix="/v1/auth/v0", tags=["daa-auth-v0"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso_from_dt(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_iso_utc(v: str | None) -> datetime | None:
    s = (v or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return None
    return dt.astimezone(timezone.utc)


def _cleanup_login_tokens(db: Session) -> None:
    now = now_iso()
    (
        db.query(DaaAuthLoginToken)
        .filter(or_(DaaAuthLoginToken.used_at.isnot(None), DaaAuthLoginToken.expires_at <= now))
        .delete(synchronize_session=False)
    )
    db.commit()


def _safe_redirect_path(v: str | None) -> str:
    # Prevent open redirects: only allow a relative path starting with a single '/'.
    s = (v or "").strip()
    if not s:
        return ""
    if not s.startswith("/"):
        return ""
    if s.startswith("//"):
        return ""
    if ":" in s:
        return ""
    return s


def _public_base_url() -> str:
    # Used to build the absolute verify URL sent via email.
    # Example: https://exwxyzi.cn/daa-api
    return (os.getenv("DAA_AUTH_PUBLIC_BASE_URL") or "").strip().rstrip("/")


def _email_from() -> str:
    return (os.getenv("DAA_AUTH_EMAIL_FROM") or "").strip()


def _resend_api_key() -> str:
    return (os.getenv("RESEND_API_KEY") or "").strip()


def _send_email_resend(*, to_email: str, subject: str, html: str) -> None:
    api_key = _resend_api_key()
    from_email = _email_from()

    if not api_key or not from_email:
        if is_production():
            missing = []
            if not api_key:
                missing.append("RESEND_API_KEY")
            if not from_email:
                missing.append("DAA_AUTH_EMAIL_FROM")
            raise HTTPException(status_code=500, detail=f"server misconfigured: missing {', '.join(missing)}")
        # Dev mode: don't fail the whole flow; caller can return the link for manual testing.
        return

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={"authorization": f"Bearer {api_key}", "content-type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if getattr(resp, "status", 200) >= 400:
                raise HTTPException(status_code=502, detail=f"email provider error: http {resp.status}")
    except urllib.error.HTTPError as e:
        # Avoid leaking provider response bodies (may contain sensitive info).
        raise HTTPException(status_code=502, detail=f"email provider error: http {getattr(e, 'code', 'unknown')}")
    except Exception as e:
        # Avoid leaking details (tokens/urls/provider internals) in production.
        if is_production():
            raise HTTPException(status_code=502, detail="email send failed")
        raise HTTPException(status_code=502, detail=f"email send failed: {e}")


def _make_login_token(db: Session, *, email: str, minutes: int = 15) -> str:
    token_id = secrets.token_urlsafe(12)
    secret = secrets.token_urlsafe(32)

    created_at = now_iso()
    expires_at = _iso_from_dt(_now_utc() + timedelta(minutes=minutes))

    db.add(
        DaaAuthLoginToken(
            token_id=token_id,
            created_at=created_at,
            email=email,
            secret_hash=sha256_hex(secret),
            expires_at=expires_at,
            used_at=None,
        )
    )
    db.commit()

    return f"{token_id}.{secret}"


def _consume_login_token(db: Session, token: str) -> tuple[str, str]:
    raw = (token or "").strip()
    if not raw or "." not in raw:
        raise HTTPException(status_code=400, detail="invalid token")

    token_id, secret = raw.split(".", 1)
    token_id = token_id.strip()
    secret = secret.strip()
    if not token_id or not secret or len(token_id) > 128 or len(secret) > 256:
        raise HTTPException(status_code=400, detail="invalid token")

    row = db.get(DaaAuthLoginToken, token_id)
    if not row:
        raise HTTPException(status_code=400, detail="invalid token")

    if row.used_at:
        raise HTTPException(status_code=400, detail="token already used")

    now_dt = _now_utc()
    expires_dt = _parse_iso_utc(row.expires_at)
    if not expires_dt or expires_dt <= now_dt:
        raise HTTPException(status_code=400, detail="token expired")

    if not secure_eq(row.secret_hash, sha256_hex(secret)):
        raise HTTPException(status_code=400, detail="invalid token")

    # Mark as used before issuing a session.
    row.used_at = _iso_from_dt(now_dt)
    db.commit()

    email = normalize_email(row.email)
    if not is_reasonable_email(email):
        raise HTTPException(status_code=400, detail="invalid token")

    role = infer_role_from_email(email)
    if not role:
        if is_production():
            raise HTTPException(status_code=403, detail="forbidden")
        # Dev-only: if allowlist isn't configured, keep local testing friction low.
        role = "editor"

    return email, role


@router.post("/request-link")
def request_link(
    body: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    email_raw = str((body or {}).get("email") or "")
    email = normalize_email(email_raw)
    redirect_path = _safe_redirect_path(str((body or {}).get("redirect") or ""))

    if not is_reasonable_email(email):
        return JSONResponse({"ok": False, "error": "invalid email"}, status_code=400)

    lists = get_admin_emails()
    allowlist_enabled = bool(lists["viewer"] or lists["editor"])

    if not allowlist_enabled:
        if is_production():
            raise HTTPException(status_code=500, detail="server misconfigured: missing DAA_ADMIN_VIEWER_EMAILS/DAA_ADMIN_EDITOR_EMAILS")
    else:
        if not infer_role_from_email(email):
            # Avoid leaking which emails are allowed.
            raise HTTPException(status_code=403, detail="forbidden")

    # Opportunistically prune consumed/expired rows so token tables do not grow unbounded.
    _cleanup_login_tokens(db)

    token = _make_login_token(db, email=email)

    base = _public_base_url()
    if is_production() and not base:
        # In prod we must send an absolute link; a relative one will be unusable.
        raise HTTPException(status_code=500, detail="server misconfigured: missing DAA_AUTH_PUBLIC_BASE_URL")

    if base:
        verify_url = f"{base}/v1/auth/v0/verify?token={token}"
        if redirect_path:
            verify_url += f"&redirect={redirect_path}"
    else:
        # Dev fallback: return a relative verify path.
        verify_url = f"/v1/auth/v0/verify?token={token}"
        if redirect_path:
            verify_url += f"&redirect={redirect_path}"

    subject = "Your sign-in link"
    html = (
        "<p>Click the link below to sign in. This link expires in about 15 minutes and can be used only once.</p>"
        f"<p><a href=\"{verify_url}\">Sign in</a></p>"
        "<p>If you did not request this, you can ignore this email.</p>"
    )

    _send_email_resend(to_email=email, subject=subject, html=html)

    # In production we never return the link.
    if is_production():
        return {"ok": True}

    return {"ok": True, "dev": {"verifyUrl": verify_url}}


@router.get("/verify")
def verify(
    request: Request,
    token: str = Query(min_length=10),
    redirect: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    _cleanup_login_tokens(db)
    email, role = _consume_login_token(db, token)

    sid, secret, max_age = create_session(db, email=email, role=role)

    cookie_val = f"{sid}.{secret}"

    redirect_path = _safe_redirect_path(redirect)

    if redirect_path:
        resp = RedirectResponse(url=redirect_path, status_code=302)
    else:
        resp = JSONResponse({"ok": True, "role": role})

    resp.set_cookie(
        key=session_cookie_name(),
        value=cookie_val,
        httponly=True,
        secure=is_production(),
        samesite="lax",
        max_age=max_age,
        path="/",
    )

    return resp


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    result = check_session("viewer", request, db, touch_last_seen=True)
    if not result.context:
        resp = JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
        # Clear stale/invalid cookies so the browser stops sending dead session state.
        if request.cookies.get(session_cookie_name()):
            resp.delete_cookie(key=session_cookie_name(), path="/")
        return resp

    ctx = result.context
    resp = JSONResponse({"ok": True, "role": ctx.role, "actorUserId": ctx.actor_user_id})

    if result.should_rotate and result.session_id:
        rotated = rotate_session_cookie(db, result.session_id)
        if rotated:
            cookie_val, max_age = rotated
            resp.set_cookie(
                key=session_cookie_name(),
                value=cookie_val,
                httponly=True,
                secure=is_production(),
                samesite="lax",
                max_age=max_age,
                path="/",
            )

    return resp


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    cookie = request.cookies.get(session_cookie_name())
    if cookie and "." in cookie:
        sid = cookie.split(".", 1)[0].strip()
        revoke_session(db, sid)

    resp = JSONResponse({"ok": True})
    resp.delete_cookie(key=session_cookie_name(), path="/")
    return resp
