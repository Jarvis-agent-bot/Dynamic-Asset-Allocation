// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TradesOrdersPanel } from "../TradesSections";

describe("TradesSections", () => {
  it("订单面板会展示 submitted 与 partially_filled 的中文状态", () => {
    render(
      <TradesOrdersPanel
        model={{
          orders: [
            {
              ticketId: "t-1",
              symbol: "AAPL",
              side: "BUY",
              status: "submitted",
              qty: 1,
              price: 100,
              avgFillPrice: null,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:00:00.000Z",
            },
            {
              ticketId: "t-2",
              symbol: "QQQ",
              side: "SELL",
              status: "partially_filled",
              qty: 2,
              price: 200,
              avgFillPrice: 201,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:05:00.000Z",
            },
          ],
          ledgerMeta: {
            ledgerStartTs: null,
            archivedTradeCount: 0,
          },
        } as any}
      />,
    );

    expect(screen.getByText("已提交")).toBeTruthy();
    expect(screen.getByText("部分成交")).toBeTruthy();
  });

  it("订单方向会兼容大写 side 并显示中文", () => {
    render(
      <TradesOrdersPanel
        model={{
          orders: [
            {
              ticketId: "t-3",
              symbol: "NVDA",
              side: "BUY",
              status: "executed",
              qty: 1.2,
              price: 180,
              avgFillPrice: 180,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:10:00.000Z",
            },
            {
              ticketId: "t-4",
              symbol: "NVDA",
              side: "SELL",
              status: "executed",
              qty: 0.5,
              price: 181,
              avgFillPrice: 181,
              instrumentCurrency: "USD",
              updatedAt: "2026-03-19T10:11:00.000Z",
            },
          ],
          ledgerMeta: {
            ledgerStartTs: null,
            archivedTradeCount: 0,
          },
        } as any}
      />,
    );

    expect(screen.getAllByText("买入").length).toBeGreaterThan(0);
    expect(screen.getAllByText("卖出").length).toBeGreaterThan(0);
  });
});
