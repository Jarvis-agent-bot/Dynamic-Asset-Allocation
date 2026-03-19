import { afterEach, describe, expect, it, vi } from "vitest";

import { IbkrPaperBroker } from "@/src/daa/broker";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ibkr-paper-broker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("读取账户摘要与持仓", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/iserver/accounts")) {
        return jsonResponse({ accounts: ["DU123456"], selectedAccount: "DU123456" });
      }
      if (url.endsWith("/portfolio/accounts")) {
        return jsonResponse([{ id: "DU123456", accountTitle: "Paper Account" }]);
      }
      if (url.endsWith("/portfolio/DU123456/ledger")) {
        return jsonResponse({
          basecurrency: "USD",
          USD: {
            cashbalance: 1200.5,
          },
        });
      }
      if (url.endsWith("/portfolio/DU123456/summary")) {
        return jsonResponse([
          { tag: "availablefunds", amount: 950.25 },
          { tag: "buyingpower", amount: 2000 },
          { tag: "netliquidation", amount: 1530.75 },
        ]);
      }
      if (url.endsWith("/portfolio/DU123456/positions/0")) {
        return jsonResponse([
          {
            ticker: "AAPL",
            currency: "USD",
            position: 2,
            avgPrice: 100,
            mktPrice: 111,
            mktValue: 222,
            conid: "265598",
            listingExchange: "NASDAQ",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const broker = new IbkrPaperBroker({
      baseUrl: "https://ibkr.example.com/v1/api",
      accountId: "DU123456",
      sessionCookie: "cp=paper-session",
      oauthToken: null,
      csrfToken: null,
    });

    const summary = await broker.getAccountSummary();
    const positions = await broker.getPositions();

    expect(summary.accountId).toBe("DU123456");
    expect(summary.accountAlias).toBe("Paper Account");
    expect(summary.baseCurrency).toBe("USD");
    expect(summary.cash).toBeCloseTo(1200.5, 6);
    expect(summary.investableCash).toBeCloseTo(950.25, 6);
    expect(summary.totalEquity).toBeCloseTo(1530.75, 6);

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({
      accountId: "DU123456",
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      qty: 2,
      costBasis: 200,
      lastPrice: 111,
      brokerConid: "265598",
    });
  });

  it("下单时会自动处理 reply 确认", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/iserver/accounts")) {
        return jsonResponse({ accounts: ["DU123456"], selectedAccount: "DU123456" });
      }
      if (url.endsWith("/portfolio/accounts")) {
        return jsonResponse([{ id: "DU123456", accountTitle: "Paper Account" }]);
      }
      if (url.includes("/trsrv/stocks?symbols=AAPL")) {
        return jsonResponse({
          AAPL: [{
            contracts: [
              { conid: "265598", exchange: "SMART", isUS: true },
            ],
          }],
        });
      }
      if (url.endsWith("/iserver/account/DU123456/orders")) {
        const body = JSON.parse(String(init?.body || "{}")) as { orders?: Array<Record<string, unknown>> };
        expect(body.orders?.[0]?.conid).toBe("265598");
        expect(body.orders?.[0]?.orderType).toBe("MKT");
        expect(body.orders?.[0]?.side).toBe("BUY");
        return jsonResponse([
          {
            id: "reply-001",
            message: ["This order will be routed outside regular trading hours."],
          },
        ]);
      }
      if (url.endsWith("/iserver/reply/reply-001")) {
        return jsonResponse([
          {
            order_id: "817231",
            order_status: "Submitted",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const broker = new IbkrPaperBroker({
      baseUrl: "https://ibkr.example.com/v1/api",
      accountId: "DU123456",
      sessionCookie: "cp=paper-session",
      oauthToken: null,
      csrfToken: "csrf-token",
    });

    const result = await broker.placeOrder({
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      side: "BUY",
      qty: 3,
      orderType: "MKT",
      referencePrice: 111,
    });

    expect(result.accepted).toBe(true);
    expect(result.order.orderId).toBe("817231");
    expect(result.order.status).toBe("Submitted");
    expect(result.messages.join(" ")).toContain("outside regular trading hours");
  });
});
