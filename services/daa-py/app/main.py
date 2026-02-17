from __future__ import annotations

import os
from typing import Literal, Optional

from fastapi import FastAPI, Query

from pydantic import BaseModel, Field

app = FastAPI(title="DAA Python Engine", version="0.1.0")

# Hard guardrail: this service is engine-only. Public /api/daa routes are owned
# by Next.js and must never be mounted from FastAPI.
if os.environ.get("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES", "0") == "1":
    raise RuntimeError("DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=1 is no longer supported; public /api/daa is Next.js-only")


class HealthResponse(BaseModel):
    ok: bool
    service: Literal["daa-engine"] = "daa-engine"
    version: str


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(ok=True, version=app.version)


def _parse_yyyy_mm_dd(s: str) -> str:
    # Keep it strict and return the canonical YYYY-MM-DD string.
    d = s.strip()
    if len(d) != 10 or d[4] != "-" or d[7] != "-":
        raise ValueError("expected YYYY-MM-DD")
    # Basic digit check (avoids pulling in extra deps just for date parsing).
    y, m, dd = d[:4], d[5:7], d[8:10]
    if not (y.isdigit() and m.isdigit() and dd.isdigit()):
        raise ValueError("expected YYYY-MM-DD")
    return d


class PriceBar(BaseModel):
    date: str = Field(min_length=10, max_length=10)
    close: float


class YfinanceHistoryResponse(BaseModel):
    ok: bool
    source: Literal["yfinance"] = "yfinance"
    symbol: str
    interval: str
    series: list[PriceBar]
    issues: list[str] = []


@app.get("/v1/market/yfinance/history", response_model=YfinanceHistoryResponse)
def yfinance_history(
    symbol: str = Query(min_length=1, description="Ticker symbol, e.g. SPY / AAPL / 0700.HK"),
    start: Optional[str] = Query(default=None, description="YYYY-MM-DD (inclusive)"),
    end: Optional[str] = Query(default=None, description="YYYY-MM-DD (inclusive)"),
    interval: str = Query(default="1d", description="yfinance interval, e.g. 1d"),
):
    """Fetch daily history via yfinance and normalize to PriceBar[].

    Notes:
    - yfinance `history(end=...)` treats end as exclusive. We convert (inclusive end)
      by shifting end + 1 day when provided.
    - v0 only needs {date, close}; we keep the response stable and minimal.
    """

    # Import lazily so the engine can still start without this route being hit.
    import datetime as _dt
    import math as _math

    import yfinance as yf

    issues: list[str] = []

    start_s: Optional[str] = None
    if start:
        try:
            start_s = _parse_yyyy_mm_dd(start)
        except Exception as e:
            return YfinanceHistoryResponse(ok=False, symbol=symbol, interval=interval, series=[], issues=[f"invalid start: {e}"])

    end_exclusive: Optional[_dt.datetime] = None
    if end:
        try:
            end_s = _parse_yyyy_mm_dd(end)
            y, m, d = int(end_s[:4]), int(end_s[5:7]), int(end_s[8:10])
            end_exclusive = _dt.datetime(y, m, d, tzinfo=_dt.timezone.utc) + _dt.timedelta(days=1)
        except Exception as e:
            return YfinanceHistoryResponse(ok=False, symbol=symbol, interval=interval, series=[], issues=[f"invalid end: {e}"])

    try:
        t = yf.Ticker(symbol)
        df = t.history(
            start=start_s,
            end=end_exclusive,
            interval=interval,
            auto_adjust=False,
            actions=False,
        )
    except Exception as e:
        return YfinanceHistoryResponse(ok=False, symbol=symbol, interval=interval, series=[], issues=[f"yfinance error: {e}"])

    if df is None or df.empty:
        issues.append("empty series")
        return YfinanceHistoryResponse(ok=True, symbol=symbol, interval=interval, series=[], issues=issues)

    # Normalize index -> YYYY-MM-DD and Close -> float.
    out: list[PriceBar] = []
    try:
        # The index is usually a DatetimeIndex.
        for idx, row in df.iterrows():
            # idx may be tz-aware; we only keep the date component.
            if hasattr(idx, "to_pydatetime"):
                dt = idx.to_pydatetime()
            else:
                dt = idx
            date = str(getattr(dt, "date", lambda: dt)())
            raw_close = row.get("Close")
            if raw_close is None:
                issues.append("missing close")
                continue

            close = float(raw_close)
            if not _math.isfinite(close):
                issues.append("non-finite close")
                continue

            out.append(PriceBar(date=date, close=close))
    except Exception as e:
        return YfinanceHistoryResponse(ok=False, symbol=symbol, interval=interval, series=[], issues=[f"normalize error: {e}"])

    # Best-effort: enforce start/end filters on our side too.
    if start_s:
        out = [b for b in out if b.date >= start_s]
    if end:
        end_s = _parse_yyyy_mm_dd(end)
        out = [b for b in out if b.date <= end_s]

    return YfinanceHistoryResponse(ok=True, symbol=symbol, interval=interval, series=out, issues=issues)


Side = Literal["BUY", "SELL", "HOLD"]


class MoneyAccount(BaseModel):
    baseCcy: str = Field(min_length=1)
    totalEquity: float = Field(gt=0)
    cash: float = Field(ge=0)
    investable: float = Field(ge=0)


class Constraints(BaseModel):
    maxPositionPct: float = Field(gt=0, le=1)
    maxIn: float = Field(ge=0)
    maxOut: float = Field(ge=0)


class Tags(BaseModel):
    riskPreference: Optional[Literal["high", "mid", "low"]] = None
    riskScore: Optional[Literal["high", "mid", "low", "sb"]] = None
    custom: Optional[list[str]] = None


class AllocationItem(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    targetPct: float = Field(ge=0, le=1)
    tags: Optional[Tags] = None


class MoneyPlan(BaseModel):
    account: MoneyAccount
    constraints: Constraints
    allocations: list[AllocationItem]


class Signal(BaseModel):
    symbol: str = Field(min_length=1)
    action: Side
    score: float = Field(ge=0, le=1)
    reason: Optional[str] = None


class RebalanceRequest(BaseModel):
    money_plan: MoneyPlan
    signals: list[Signal]


class SuggestedOrder(BaseModel):
    symbol: str
    side: Literal["BUY", "SELL"]
    notional: float
    reason: str


class RebalanceResponse(BaseModel):
    orders: list[SuggestedOrder]
    warnings: list[str]
    explain: dict


@app.post("/v1/rebalance/simulate", response_model=RebalanceResponse)
def rebalance_simulate(req: RebalanceRequest):
    """v0: minimal bridge from signals + money constraints to suggested orders.

    Heuristic (intentionally simple):
    - BUY => allocate up to investable * maxPositionPct (capped by maxIn and available cash)
    - SELL => suggest a sell of the same notional cap (capped by maxOut)
    - HOLD => no order

    This is NOT a full portfolio optimizer. It's a product scaffold.
    """

    acct = req.money_plan.account
    c = req.money_plan.constraints

    # Basic consistency warnings
    warnings: list[str] = []
    if acct.cash > acct.totalEquity:
        warnings.append("cash > totalEquity (input inconsistency)")
    if acct.investable > acct.totalEquity:
        warnings.append("investable > totalEquity (input inconsistency)")

    per_position_cap = max(0.0, acct.investable * c.maxPositionPct)

    orders: list[SuggestedOrder] = []
    for s in req.signals:
        if s.action == "HOLD":
            continue

        if s.action == "BUY":
            notional = min(per_position_cap, c.maxIn, acct.cash)
            if notional <= 0:
                continue
            orders.append(
                SuggestedOrder(
                    symbol=s.symbol,
                    side="BUY",
                    notional=float(notional),
                    reason=f"BUY signal (score={s.score:.2f}); capped by maxPositionPct/maxIn/cash",
                )
            )

        if s.action == "SELL":
            notional = min(per_position_cap, c.maxOut)
            if notional <= 0:
                continue
            orders.append(
                SuggestedOrder(
                    symbol=s.symbol,
                    side="SELL",
                    notional=float(notional),
                    reason=f"SELL signal (score={s.score:.2f}); capped by maxPositionPct/maxOut",
                )
            )

    explain = {
        "policy": "v0 heuristic",
        "per_position_cap": per_position_cap,
        "constraints": c.model_dump(),
        "notes": [
            "v0 does not consider existing positions",
            "v0 does not do portfolio-level optimization",
        ],
    }

    return RebalanceResponse(orders=orders, warnings=warnings, explain=explain)
