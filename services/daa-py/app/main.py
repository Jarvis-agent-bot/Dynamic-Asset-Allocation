from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="DAA Python Engine", version="0.1.0")


class HealthResponse(BaseModel):
    ok: bool
    service: Literal["daa-engine"] = "daa-engine"
    version: str


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(ok=True, version=app.version)


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
