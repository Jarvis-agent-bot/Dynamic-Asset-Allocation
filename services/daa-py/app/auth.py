from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.deps import get_db
from app.session import require_session
from app.util import get_admin_tokens, infer_actor_user_id_from_token, is_production, normalize_token


@dataclass(frozen=True)
class AuthContext:
    role: str
    actor_user_id: str


def _allowed_tokens(role: str) -> list[str]:
    toks = get_admin_tokens()

    legacy = toks["legacy"]
    viewer = toks["viewer"]
    editor = toks["editor"]

    if role == "editor":
        allowed = [t for t in [editor, legacy] if t]
    else:
        allowed = [t for t in [viewer, editor, legacy] if t]

    # Keep deterministic ordering.
    out: list[str] = []
    for t in allowed:
        if t not in out:
            out.append(t)
    return out


def _require(role: str, authorization: str | None, request: Request, db: Session) -> AuthContext:
    # Prefer cookie-session auth (dashboard login) when available.
    ctx = require_session(role, request, db)
    if ctx:
        return ctx

    allowed = _allowed_tokens(role)

    # If no tokens are configured, keep dev friction low.
    if not allowed:
        if is_production():
            need = "DAA_ADMIN_EDITOR_TOKEN (or legacy DAA_ADMIN_TOKEN)" if role == "editor" else "DAA_ADMIN_VIEWER_TOKEN (or DAA_ADMIN_EDITOR_TOKEN, or legacy DAA_ADMIN_TOKEN)"
            raise HTTPException(status_code=500, detail=f"server misconfigured: missing {need}")
        return AuthContext(role=role, actor_user_id="unknown-token")

    auth = normalize_token(authorization)
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="unauthorized", headers={"www-authenticate": "Bearer"})

    token = normalize_token(auth.split(" ", 1)[1] if " " in auth else "")
    if not token or token not in allowed:
        raise HTTPException(status_code=401, detail="unauthorized", headers={"www-authenticate": "Bearer"})

    return AuthContext(role=role, actor_user_id=infer_actor_user_id_from_token(token))


def require_viewer(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> AuthContext:
    return _require("viewer", authorization, request, db)


def require_editor(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> AuthContext:
    return _require("editor", authorization, request, db)
