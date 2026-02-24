from __future__ import annotations

import os
from typing import Any, Literal, Optional

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
    minTradeNotional: float = Field(default=0, ge=0)
    minTradeUnit: float = Field(default=0, ge=0)


class Tags(BaseModel):
    riskPreference: Optional[Literal["high", "mid", "low"]] = None
    riskScore: Optional[Literal["high", "mid", "low", "sb"]] = None
    custom: Optional[list[str]] = None


class AllocationItem(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    targetPct: float = Field(ge=0, le=1)
    tags: Optional[Tags] = None


class Position(BaseModel):
    symbol: str = Field(min_length=1)
    notional: float = Field(ge=0)


class TradingCosts(BaseModel):
    buyBps: float = Field(default=0, ge=0)
    sellBps: float = Field(default=0, ge=0)


class MoneyPlan(BaseModel):
    account: MoneyAccount
    constraints: Constraints
    allocations: list[AllocationItem]
    positions: list[Position] = Field(default_factory=list)
    costs: TradingCosts = Field(default_factory=TradingCosts)


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


def _round_down_to_unit(value: float, unit: float) -> float:
    if unit <= 0:
        return max(0.0, value)
    steps = int(value / unit)
    return max(0.0, float(steps) * unit)


@app.post("/v1/rebalance/simulate", response_model=RebalanceResponse)
def rebalance_simulate(req: RebalanceRequest):
    """v1 constraint optimizer with holdings, budgets, costs, and diagnostics."""

    acct = req.money_plan.account
    c = req.money_plan.constraints
    costs = req.money_plan.costs

    warnings: list[str] = []
    if acct.cash > acct.totalEquity:
        warnings.append("cash > totalEquity (input inconsistency)")
    if acct.investable > acct.totalEquity:
        warnings.append("investable > totalEquity (input inconsistency)")

    position_map = {p.symbol: p.notional for p in req.money_plan.positions}
    max_position_notional = max(0.0, acct.investable * c.maxPositionPct)

    max_in_remaining = c.maxIn
    max_out_remaining = c.maxOut
    cash_remaining = acct.cash

    buy_fee = costs.buyBps / 10_000
    sell_fee = costs.sellBps / 10_000

    orders: list[SuggestedOrder] = []
    diagnostics: list[dict[str, Any]] = []

    sell_signals = sorted((s for s in req.signals if s.action == "SELL"), key=lambda x: x.score, reverse=True)
    buy_signals = sorted((s for s in req.signals if s.action == "BUY"), key=lambda x: x.score, reverse=True)

    for s in sell_signals:
        current = position_map.get(s.symbol, 0.0)
        cap = min(current, max_out_remaining)
        tradable = _round_down_to_unit(cap, c.minTradeUnit)
        if tradable < c.minTradeNotional:
            diagnostics.append(
                {
                    "symbol": s.symbol,
                    "action": s.action,
                    "score": s.score,
                    "status": "suppressed",
                    "reason": "below_min_trade_notional",
                    "candidate_notional": tradable,
                }
            )
            continue
        if tradable <= 0:
            diagnostics.append(
                {
                    "symbol": s.symbol,
                    "action": s.action,
                    "score": s.score,
                    "status": "suppressed",
                    "reason": "no_sell_capacity",
                }
            )
            continue

        orders.append(
            SuggestedOrder(
                symbol=s.symbol,
                side="SELL",
                notional=tradable,
                reason=f"SELL signal (score={s.score:.2f}); capped by holdings/maxOut/minTradeUnit",
            )
        )
        max_out_remaining = max(0.0, max_out_remaining - tradable)
        cash_remaining += tradable * (1 - sell_fee)
        position_map[s.symbol] = max(0.0, current - tradable)

        diagnostics.append(
            {
                "symbol": s.symbol,
                "action": s.action,
                "score": s.score,
                "status": "applied",
                "notional": tradable,
                "current_position": current,
                "remaining_maxOut": max_out_remaining,
            }
        )

    for s in buy_signals:
        current = position_map.get(s.symbol, 0.0)
        position_headroom = max(0.0, max_position_notional - current)
        cash_cap = cash_remaining / (1 + buy_fee) if (1 + buy_fee) > 0 else 0.0
        cap = min(position_headroom, max_in_remaining, cash_cap)
        tradable = _round_down_to_unit(cap, c.minTradeUnit)

        if tradable < c.minTradeNotional:
            diagnostics.append(
                {
                    "symbol": s.symbol,
                    "action": s.action,
                    "score": s.score,
                    "status": "suppressed",
                    "reason": "below_min_trade_notional",
                    "candidate_notional": tradable,
                }
            )
            continue
        if tradable <= 0:
            diagnostics.append(
                {
                    "symbol": s.symbol,
                    "action": s.action,
                    "score": s.score,
                    "status": "suppressed",
                    "reason": "no_buy_capacity",
                    "position_headroom": position_headroom,
                    "maxIn_remaining": max_in_remaining,
                    "cash_remaining": cash_remaining,
                }
            )
            continue

        orders.append(
            SuggestedOrder(
                symbol=s.symbol,
                side="BUY",
                notional=tradable,
                reason=f"BUY signal (score={s.score:.2f}); capped by maxPosition/maxIn/cash/minTradeUnit",
            )
        )
        max_in_remaining = max(0.0, max_in_remaining - tradable)
        cash_remaining -= tradable * (1 + buy_fee)
        position_map[s.symbol] = current + tradable

        diagnostics.append(
            {
                "symbol": s.symbol,
                "action": s.action,
                "score": s.score,
                "status": "applied",
                "notional": tradable,
                "current_position": current,
                "remaining_maxIn": max_in_remaining,
                "remaining_cash": cash_remaining,
            }
        )

    explain = {
        "policy": "v1 constrained optimizer",
        "max_position_notional": max_position_notional,
        "constraints": c.model_dump(),
        "costs": costs.model_dump(),
        "budget": {
            "start_cash": acct.cash,
            "end_cash": cash_remaining,
            "remaining_maxIn": max_in_remaining,
            "remaining_maxOut": max_out_remaining,
        },
        "diagnostics": diagnostics,
        "notes": [
            "v1 is holdings-aware",
            "v1 enforces maxIn/maxOut/maxPosition and min-trade controls",
            "v1 accounts for buy/sell bps costs in cash budget",
        ],
    }

    return RebalanceResponse(orders=orders, warnings=warnings, explain=explain)
