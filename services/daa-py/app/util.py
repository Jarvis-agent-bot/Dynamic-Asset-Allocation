from __future__ import annotations

import os
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
