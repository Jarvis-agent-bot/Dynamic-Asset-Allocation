from __future__ import annotations

import hashlib
import hmac
import os
import re
import uuid
from datetime import datetime, timezone


def now_iso() -> str:
    # Match JS Date.toISOString() formatting (ends with 'Z').
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4()}"


def is_production() -> bool:
    # Best-effort parity with the Next.js codepaths.
    return (os.getenv("NODE_ENV") or "").strip().lower() == "production"


def normalize_token(v: str | None) -> str:
    return (v or "").strip()


def get_admin_tokens() -> dict[str, str]:
    return {
        "legacy": normalize_token(os.getenv("DAA_ADMIN_TOKEN")),
        "viewer": normalize_token(os.getenv("DAA_ADMIN_VIEWER_TOKEN")),
        "editor": normalize_token(os.getenv("DAA_ADMIN_EDITOR_TOKEN")),
    }


def infer_actor_user_id_from_token(token: str | None) -> str:
    t = normalize_token(token)
    if not t:
        return "unknown-token"

    toks = get_admin_tokens()
    if toks["viewer"] and t == toks["viewer"]:
        return "viewer-token"
    if toks["editor"] and t == toks["editor"]:
        return "editor-token"
    if toks["legacy"] and t == toks["legacy"]:
        return "legacy-token"
    return "unknown-token"


def derive_actor_source(kind: str, payload: object) -> tuple[str, str]:
    # Mirror the TS heuristic: prefer payload.actor/source; otherwise derive from kind/source.
    k = (kind or "").strip()

    source = ""
    actor = ""

    if isinstance(payload, dict):
        source = str(payload.get("source") or "").strip()
        actor = str(payload.get("actor") or "").strip()

    lc_source = source.lower()
    lc_kind = k.lower()

    if not actor:
        if "/daa/dashboard" in lc_source or "dashboard" in lc_kind:
            actor = "dashboard"
        elif "/daa/market/funds" in lc_source or "market-funds" in lc_kind:
            actor = "market-funds"
        else:
            actor = "unknown"

    return actor, source


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(v: str | None) -> str:
    # Keep it strict and deterministic.
    e = (v or "").strip().lower()
    return e


def is_reasonable_email(v: str | None) -> bool:
    e = normalize_email(v)
    if not e or len(e) > 320:
        return False
    return bool(_EMAIL_RE.match(e))


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def secure_eq(a: str, b: str) -> bool:
    # Use constant-time compare to reduce timing side channels.
    return hmac.compare_digest(a, b)


def get_admin_emails() -> dict[str, list[str]]:
    """Allowed emails for passwordless login.

    Env:
    - DAA_ADMIN_EDITOR_EMAILS: comma-separated
    - DAA_ADMIN_VIEWER_EMAILS: comma-separated

    Notes:
    - If editor list is set, those emails implicitly have viewer access.
    - If both lists are empty, passwordless auth is considered disabled.
    """

    def _parse_list(raw: str | None) -> list[str]:
        out: list[str] = []
        for part in (raw or "").split(","):
            e = normalize_email(part)
            if not e:
                continue
            if e not in out:
                out.append(e)
        return out

    editor = _parse_list(os.getenv("DAA_ADMIN_EDITOR_EMAILS"))
    viewer = _parse_list(os.getenv("DAA_ADMIN_VIEWER_EMAILS"))

    # Keep deterministic ordering.
    viewer_all: list[str] = []
    for e in viewer + editor:
        if e not in viewer_all:
            viewer_all.append(e)

    return {"editor": editor, "viewer": viewer_all}


def infer_role_from_email(email: str) -> str | None:
    e = normalize_email(email)
    if not e:
        return None

    lists = get_admin_emails()
    if e in lists["editor"]:
        return "editor"
    if e in lists["viewer"]:
        return "viewer"
    return None


def infer_actor_user_id_from_email(email: str) -> str:
    # Stable, non-reversible user id for audit trails.
    e = normalize_email(email)
    if not e:
        return "unknown-email"
    return f"email_{sha256_hex(e)[:12]}"
