from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models import DaaAuthSession
from app.util import infer_actor_user_id_from_email, now_iso, secure_eq, sha256_hex


def session_cookie_name() -> str:
    return (os.getenv("DAA_AUTH_COOKIE_NAME") or "daa_api_session").strip() or "daa_api_session"


def _split_token(v: str | None) -> tuple[str, str] | None:
    raw = (v or "").strip()
    if not raw:
        return None
    if "." not in raw:
        return None
    sid, secret = raw.split(".", 1)
    sid = sid.strip()
    secret = secret.strip()
    if not sid or not secret:
        return None
    return sid, secret


def _role_allows(session_role: str, required_role: str) -> bool:
    # viewer < editor
    s = (session_role or "").strip().lower()
    r = (required_role or "").strip().lower()

    if r == "viewer":
        return s in ("viewer", "editor")
    if r == "editor":
        return s == "editor"
    return False


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _iso_from_dt(dt: datetime) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def create_session(db: Session, *, email: str, role: str, days: int = 14) -> tuple[str, str, int]:
    sid = secrets.token_urlsafe(12)
    secret = secrets.token_urlsafe(32)
    created_at = now_iso()
    expires_dt = _now_utc() + timedelta(days=days)
    expires_at = _iso_from_dt(expires_dt)

    db.add(
        DaaAuthSession(
            session_id=sid,
            created_at=created_at,
            email=email,
            role=role,
            secret_hash=sha256_hex(secret),
            expires_at=expires_at,
            revoked_at=None,
            last_seen_at=None,
        )
    )
    db.commit()

    max_age = int((expires_dt - _now_utc()).total_seconds())
    return sid, secret, max_age


def revoke_session(db: Session, session_id: str) -> None:
    sid = (session_id or "").strip()
    if not sid:
        return

    row = db.get(DaaAuthSession, sid)
    if not row:
        return

    if row.revoked_at:
        return

    row.revoked_at = now_iso()
    db.commit()


def require_session(required_role: str, request: Request, db: Session):
    cookie = request.cookies.get(session_cookie_name())
    parsed = _split_token(cookie)
    if not parsed:
        return None

    sid, secret = parsed
    row = db.get(DaaAuthSession, sid)
    if not row:
        return None

    if row.revoked_at:
        return None

    # Expires_at is ISO8601 Z; lexicographic compare works.
    if (row.expires_at or "") <= now_iso():
        return None

    if not secure_eq(row.secret_hash, sha256_hex(secret)):
        return None

    if not _role_allows(row.role, required_role):
        raise HTTPException(status_code=403, detail="forbidden")

    # Best-effort last-seen update (ignore failure).
    try:
        row.last_seen_at = now_iso()
        db.commit()
    except Exception:
        db.rollback()

    from app.auth import AuthContext

    return AuthContext(role=row.role, actor_user_id=infer_actor_user_id_from_email(row.email))
