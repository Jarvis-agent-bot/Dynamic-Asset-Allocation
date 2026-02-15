from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import and_, desc, exists, func, or_, select
from sqlalchemy.orm import Session

from app.auth import AuthContext, require_editor, require_viewer
from app.deps import get_db
from app.models import DaaRun, DaaRunAuditEvent, DaaRunConfirm, DaaRunExecuted, DaaRunPortfolio
from app.util import derive_actor_source, make_id, now_iso

router = APIRouter(prefix="/api/daa/store/v0", tags=["daa-store-v0"])


def _clamp_limit(limit_raw: int | None) -> int:
    try:
        n = int(limit_raw) if limit_raw is not None else 50
    except Exception:
        n = 50
    return max(1, min(200, n))


@router.get("/runs")
def list_runs(
    req_ctx: AuthContext = Depends(require_viewer),
    db: Session = Depends(get_db),
    limit: int | None = Query(default=None),
    beforeCreatedAt: str | None = Query(default=None),
    beforeRunId: str | None = Query(default=None),
    fromCreatedAt: str | None = Query(default=None),
    toCreatedAt: str | None = Query(default=None),
    actor: str | None = Query(default=None),
):
    del req_ctx

    lim = _clamp_limit(limit)

    b_created = (beforeCreatedAt or "").strip()
    b_id = (beforeRunId or "").strip()

    from_created = (fromCreatedAt or "").strip()
    to_created = (toCreatedAt or "").strip()

    actor_raw = (actor or "").strip()
    actor_filter = actor_raw if actor_raw and actor_raw != "all" else ""

    audit_count = (
        select(func.count())
        .select_from(DaaRunAuditEvent)
        .where(DaaRunAuditEvent.run_id == DaaRun.run_id)
        .scalar_subquery()
    )

    q = select(
        DaaRun.run_id,
        DaaRun.created_at,
        DaaRun.kind,
        DaaRun.status,
        DaaRun.source,
        DaaRun.actor,
        exists(select(1).select_from(DaaRunPortfolio).where(DaaRunPortfolio.run_id == DaaRun.run_id)).label("has_portfolio"),
        exists(select(1).select_from(DaaRunConfirm).where(DaaRunConfirm.run_id == DaaRun.run_id)).label("has_confirm"),
        exists(select(1).select_from(DaaRunExecuted).where(DaaRunExecuted.run_id == DaaRun.run_id)).label("has_executed"),
        audit_count.label("audit_count"),
    )

    where = []
    if from_created:
        where.append(DaaRun.created_at >= from_created)
    if to_created:
        where.append(DaaRun.created_at <= to_created)
    if actor_filter:
        where.append(DaaRun.actor == actor_filter)

    if b_created and b_id:
        where.append(or_(DaaRun.created_at < b_created, and_(DaaRun.created_at == b_created, DaaRun.run_id < b_id)))
    elif b_created:
        where.append(DaaRun.created_at < b_created)

    if where:
        q = q.where(and_(*where))

    q = q.order_by(desc(DaaRun.created_at), desc(DaaRun.run_id)).limit(lim)

    try:
        rows = db.execute(q).all()
        runs = []
        for r in rows:
            actor_val = (r.actor or "").strip() or "unknown"
            runs.append(
                {
                    "runId": r.run_id,
                    "createdAt": r.created_at,
                    "kind": r.kind,
                    "status": r.status,
                    "source": (r.source or "").strip(),
                    "actor": actor_val,
                    "hasPortfolio": bool(r.has_portfolio),
                    "hasConfirm": bool(r.has_confirm),
                    "hasExecuted": bool(r.has_executed),
                    "auditCount": int(r.audit_count or 0),
                }
            )
        return {"ok": True, "runs": runs}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.get("/audit-events")
def list_audit_events(
    req_ctx: AuthContext = Depends(require_viewer),
    db: Session = Depends(get_db),
    limit: int | None = Query(default=None),
    beforeCreatedAt: str | None = Query(default=None),
    beforeEventId: str | None = Query(default=None),
    fromCreatedAt: str | None = Query(default=None),
    toCreatedAt: str | None = Query(default=None),
    actorUserId: str | None = Query(default=None),
):
    del req_ctx

    lim = _clamp_limit(limit)

    b_created = (beforeCreatedAt or "").strip()
    b_id = (beforeEventId or "").strip()

    from_created = (fromCreatedAt or "").strip()
    to_created = (toCreatedAt or "").strip()

    actor_raw = (actorUserId or "").strip()
    actor_filter = actor_raw if actor_raw and actor_raw != "all" else ""

    q = select(
        DaaRunAuditEvent.event_id,
        DaaRunAuditEvent.run_id,
        DaaRunAuditEvent.created_at,
        DaaRunAuditEvent.kind,
        DaaRunAuditEvent.actor_user_id,
        DaaRunAuditEvent.payload,
    )

    where = []
    if from_created:
        where.append(DaaRunAuditEvent.created_at >= from_created)
    if to_created:
        where.append(DaaRunAuditEvent.created_at <= to_created)
    if actor_filter:
        where.append(DaaRunAuditEvent.actor_user_id == actor_filter)

    if b_created and b_id:
        where.append(or_(DaaRunAuditEvent.created_at < b_created, and_(DaaRunAuditEvent.created_at == b_created, DaaRunAuditEvent.event_id < b_id)))
    elif b_created:
        where.append(DaaRunAuditEvent.created_at < b_created)

    if where:
        q = q.where(and_(*where))

    q = q.order_by(desc(DaaRunAuditEvent.created_at), desc(DaaRunAuditEvent.event_id)).limit(lim)

    try:
        rows = db.execute(q).all()
        events = []
        for r in rows:
            events.append(
                {
                    "eventId": r.event_id,
                    "runId": r.run_id,
                    "createdAt": r.created_at,
                    "kind": r.kind,
                    "actorUserId": (r.actor_user_id or "").strip(),
                    "payload": r.payload,
                }
            )
        return {"ok": True, "events": events}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.post("/run")
def create_run(
    req_ctx: AuthContext = Depends(require_editor),
    db: Session = Depends(get_db),
    body: dict = Body(default={}),
):
    kind = str((body or {}).get("kind") or "").strip()
    status = str((body or {}).get("status") or "").strip() or "created"
    payload = (body or {}).get("payload")
    if payload is None:
        # Keep the storage schema non-nullable; this matches the JS store which always writes a JSON value.
        payload = {}

    if not kind:
        return JSONResponse({"ok": False, "error": "missing kind"}, status_code=400)

    created_at = now_iso()
    run_id = make_id("run")

    actor, source = derive_actor_source(kind, payload)

    try:
        db.add(
            DaaRun(
                run_id=run_id,
                created_at=created_at,
                kind=kind,
                status=status,
                payload=payload,
                actor=actor or "unknown",
                source=source or "",
            )
        )

        db.add(
            DaaRunAuditEvent(
                event_id=make_id("audit"),
                run_id=run_id,
                created_at=created_at,
                kind="run_created",
                payload={"kind": kind, "status": status, "payload": payload, "actor": actor, "source": source},
                actor_user_id=req_ctx.actor_user_id,
            )
        )

        db.commit()
        return {"ok": True, "runId": run_id, "createdAt": created_at}
    except Exception as e:
        db.rollback()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


@router.get("/run/{runId}")
def get_run_bundle(
    runId: str,
    req_ctx: AuthContext = Depends(require_viewer),
    db: Session = Depends(get_db),
):
    del req_ctx

    rid = (runId or "").strip()
    if not rid:
        return JSONResponse({"ok": False, "error": "missing runId"}, status_code=400)

    run = db.get(DaaRun, rid)
    if not run:
        return JSONResponse({"ok": False, "error": "run not found"}, status_code=404)

    def _one_attachment(model):
        row = db.get(model, rid)
        if not row:
            return None
        return {"createdAt": row.created_at, "payload": row.payload}

    audit_q = (
        select(
            DaaRunAuditEvent.event_id,
            DaaRunAuditEvent.run_id,
            DaaRunAuditEvent.created_at,
            DaaRunAuditEvent.kind,
            DaaRunAuditEvent.actor_user_id,
            DaaRunAuditEvent.payload,
        )
        .where(DaaRunAuditEvent.run_id == rid)
        .order_by(DaaRunAuditEvent.created_at.asc(), DaaRunAuditEvent.event_id.asc())
    )

    audit_rows = db.execute(audit_q).all()
    audit = [
        {
            "eventId": r.event_id,
            "runId": r.run_id,
            "createdAt": r.created_at,
            "kind": r.kind,
            "actorUserId": (r.actor_user_id or "").strip(),
            "payload": r.payload,
        }
        for r in audit_rows
    ]

    bundle = {
        "run": {
            "runId": run.run_id,
            "createdAt": run.created_at,
            "kind": run.kind,
            "status": run.status,
            "payload": run.payload,
        },
        "portfolio": _one_attachment(DaaRunPortfolio),
        "confirm": _one_attachment(DaaRunConfirm),
        "executed": _one_attachment(DaaRunExecuted),
        "audit": audit,
    }

    return {"ok": True, "bundle": bundle}
