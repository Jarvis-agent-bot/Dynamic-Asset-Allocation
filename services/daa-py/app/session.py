from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
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


def _rotation_seconds() -> int:
    raw = (os.getenv("DAA_AUTH_SESSION_ROTATE_SECONDS") or "1800").strip()
    try:
        sec = int(raw)
    except ValueError:
        sec = 1800
    return max(0, sec)


@dataclass(frozen=True)
class SessionCheckResult:
    context: object | None
    session_id: str | None
    should_rotate: bool = False
    reject_reason: str | None = None


def create_session(db: Session, *, email: str, role: str, days: int = 14) -> tuple[str, str, int]:
    sid = secrets.token_urlsafe(12)
    secret = secrets.token_urlsafe(32)
    created_at = now_iso()
    expires_dt = _now_utc() + timedelta(days=days)
    expires_at = _iso_from_dt(expires_dt)

    # Keep only one live session per email so stale cookies from older sign-ins stop working.
    existing_rows = (
        db.query(DaaAuthSession)
        .filter(DaaAuthSession.email == email)
        .filter(DaaAuthSession.revoked_at.is_(None))
        .all()
    )
    for row in existing_rows:
        row.revoked_at = created_at

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


def check_session(required_role: str, request: Request, db: Session, *, touch_last_seen: bool = True) -> SessionCheckResult:
    cookie = request.cookies.get(session_cookie_name())
    parsed = _split_token(cookie)
    if not parsed:
        return SessionCheckResult(context=None, session_id=None, reject_reason="missing_or_malformed_cookie")

    sid, secret = parsed
    row = db.get(DaaAuthSession, sid)
    if not row:
        return SessionCheckResult(context=None, session_id=sid, reject_reason="session_not_found")

    if row.revoked_at:
        return SessionCheckResult(context=None, session_id=sid, reject_reason="session_revoked")

    now = _now_utc()
    expires_dt = _parse_iso_utc(row.expires_at)
    if not expires_dt or expires_dt <= now:
        return SessionCheckResult(context=None, session_id=sid, reject_reason="session_expired")

    if not secure_eq(row.secret_hash, sha256_hex(secret)):
        return SessionCheckResult(context=None, session_id=sid, reject_reason="secret_mismatch")

    if not _role_allows(row.role, required_role):
        raise HTTPException(status_code=403, detail="forbidden")

    should_rotate = False
    rotate_after = _rotation_seconds()
    last_seen_dt = _parse_iso_utc(row.last_seen_at)
    if rotate_after > 0:
        if not last_seen_dt:
            should_rotate = True
        else:
            should_rotate = (now - last_seen_dt).total_seconds() >= rotate_after

    if touch_last_seen:
        # Best-effort last-seen update (ignore failure).
        try:
            row.last_seen_at = _iso_from_dt(now)
            db.commit()
        except Exception:
            db.rollback()

    from app.auth import AuthContext

    return SessionCheckResult(
        context=AuthContext(role=row.role, actor_user_id=infer_actor_user_id_from_email(row.email)),
        session_id=sid,
        should_rotate=should_rotate,
        reject_reason=None,
    )


def rotate_session_cookie(db: Session, session_id: str) -> tuple[str, int] | None:
    sid = (session_id or "").strip()
    if not sid:
        return None

    row = db.get(DaaAuthSession, sid)
    if not row or row.revoked_at:
        return None

    expires_dt = _parse_iso_utc(row.expires_at)
    now = _now_utc()
    if not expires_dt or expires_dt <= now:
        return None

    secret = secrets.token_urlsafe(32)
    row.secret_hash = sha256_hex(secret)
    row.last_seen_at = _iso_from_dt(now)
    db.commit()

    max_age = int((expires_dt - now).total_seconds())
    return f"{sid}.{secret}", max_age


def require_session(required_role: str, request: Request, db: Session):
    result = check_session(required_role, request, db)
    return result.context
