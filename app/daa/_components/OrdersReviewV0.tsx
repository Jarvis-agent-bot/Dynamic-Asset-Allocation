"use client";

import { useMemo } from "react";

export type OrderLikeV0 = {
  symbol: string;
  side: string;
  notional: number;
  reason?: string;
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function sumNotional(orders: OrderLikeV0[], side: "BUY" | "SELL") {
  return orders.reduce((acc, o) => acc + (o.side === side ? o.notional : 0), 0);
}

export function OrdersReviewV0(props: {
  title?: string;
  orders: OrderLikeV0[];
  // Optional: used for risk hints. Assumes SELL executes before BUY.
  cashStart?: number | null;
  // Optional: used for risk hints / highlighting.
  minTradeNotional?: number | null;
  // Optional: show numbers like "USD".
  ccy?: string | null;
}) {
  const { title, orders, cashStart, minTradeNotional, ccy } = props;

  const buySum = useMemo(() => sumNotional(orders, "BUY"), [orders]);
  const sellSum = useMemo(() => sumNotional(orders, "SELL"), [orders]);

  const cashStartN = toFiniteNumber(cashStart);
  const minTradeN = toFiniteNumber(minTradeNotional);

  const cashAfterSells = cashStartN === null ? null : cashStartN + sellSum;
  const cashShortfall = cashAfterSells === null ? null : buySum - cashAfterSells;

  const belowMinTrade = useMemo(() => {
    if (minTradeN === null) return [] as OrderLikeV0[];
    return orders.filter((o) => Number.isFinite(o.notional) && o.notional > 0 && o.notional < minTradeN);
  }, [minTradeN, orders]);

  const ccyLabel = ccy ? ` ${ccy}` : "";
  const border = "1px solid rgba(127,127,127,0.35)";

  return (
    <div>
      {title ? <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>{title}</div> : null}

      {/* Risks / hints (v0): heuristic and non-blocking. */}
      {cashShortfall !== null && Number.isFinite(cashShortfall) && cashShortfall > 1e-6 ? (
        <div style={{ fontSize: 12, color: "var(--danger, #b00020)", marginBottom: 8 }}>
          Risk: cash may be insufficient for BUY orders. BUY sum={buySum.toFixed(2)}{ccyLabel}, available cash(after SELL)={
            cashAfterSells?.toFixed(2)
          }
          {ccyLabel}, shortfall={cashShortfall.toFixed(2)}{ccyLabel}.
        </div>
      ) : null}

      {belowMinTrade.length ? (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Hint: {belowMinTrade.length} order(s) are below minTradeNotional={minTradeN?.toFixed(2)}{ccyLabel}; they may be ignored by policy/engine.
        </div>
      ) : null}

      {orders.length ? (
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: border, paddingBottom: 6 }}>Symbol</th>
                <th style={{ textAlign: "left", borderBottom: border, paddingBottom: 6 }}>Side</th>
                <th style={{ textAlign: "right", borderBottom: border, paddingBottom: 6 }}>Notional</th>
                <th style={{ textAlign: "left", borderBottom: border, paddingBottom: 6 }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => {
                const isBelow = minTradeN !== null && Number.isFinite(o.notional) && o.notional > 0 && o.notional < minTradeN;
                return (
                  <tr key={`${o.symbol}-${idx}`} style={{ opacity: isBelow ? 0.7 : 1 }}>
                    <td style={{ padding: "6px 0" }}>{o.symbol}</td>
                    <td style={{ padding: "6px 0" }}>{o.side}</td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>{o.notional.toFixed(2)}</td>
                    <td style={{ padding: "6px 0" }} className="muted">
                      {o.reason || ""}
                      {isBelow ? <span style={{ marginLeft: 6 }}>(below minTrade)</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {cashStartN !== null ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              cashStart={cashStartN.toFixed(2)}{ccyLabel}; SELL sum={sellSum.toFixed(2)}{ccyLabel}; BUY sum={buySum.toFixed(2)}{ccyLabel}.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>No orders.</div>
      )}
    </div>
  );
}
