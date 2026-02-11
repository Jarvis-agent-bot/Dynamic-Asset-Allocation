import { describe, expect, it } from "vitest";

import {
  extractSymbolsFromText,
  mergeMarketEvents,
  normalizeTwitterInput,
  normalizeTwitterPayload,
  normalizeXueqiuNewsPayload,
  normalizeYahooFinanceNewsPayload,
} from "./normalize";

describe("market/normalize", () => {
  it("extractSymbolsFromText() extracts $TICKER", () => {
    expect(extractSymbolsFromText("hello $SPY and $qqq")).toEqual(["SPY", "QQQ"]);
  });

  it("normalizeTwitterPayload() supports generic tweet export", () => {
    const r = normalizeTwitterPayload([
      {
        id: "1870000000000000000",
        created_at: "2026-02-10T08:30:00.000Z",
        text: "Macro view $SPY $QQQ",
        author: "@a",
        url: "https://twitter.com/x",
      },
    ]);

    expect(r.issues).toEqual([]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.source).toBe("twitter");
    expect(r.events[0]?.symbols).toEqual(["SPY", "QQQ"]);
  });

  it("normalizeTwitterInput() falls back to plaintext", () => {
    const r = normalizeTwitterInput("line 1 $SPY\n\nline 2 $QQQ");
    expect(r.events).toHaveLength(2);
    expect(r.events[0]?.symbols).toEqual(["SPY"]);
  });

  it("normalizeYahooFinanceNewsPayload() supports yfinance python format", () => {
    const r = normalizeYahooFinanceNewsPayload([
      {
        uuid: "yf-1",
        title: "Earnings beat",
        link: "https://finance.yahoo.com/",
        providerPublishTime: 1765414200,
        relatedTickers: ["AAPL"],
      },
    ]);

    expect(r.issues).toEqual([]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.source).toBe("news");
    expect(r.events[0]?.tags).toEqual(["yfinance"]);
  });

  it("normalizeXueqiuNewsPayload() supports {items: [...]} wrapper", () => {
    const r = normalizeXueqiuNewsPayload({
      items: [
        {
          id: "xq-1",
          created_at: 1765417800,
          title: "雪球快讯",
          summary: "something",
          symbols: ["SH600519"],
          url: "https://xueqiu.com/",
        },
      ],
    });

    expect(r.issues).toEqual([]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.tags).toEqual(["xueqiu"]);
    expect(r.events[0]?.symbols).toEqual(["SH600519"]);
  });

  it("mergeMarketEvents() de-dupes by id and sorts desc", () => {
    const merged = mergeMarketEvents(
      [
        { id: "a", source: "news", ts: "2026-02-10T00:00:00.000Z", title: "a" },
        { id: "b", source: "news", ts: "2026-02-11T00:00:00.000Z", title: "b" },
      ],
      [{ id: "a", source: "news", ts: "2026-02-12T00:00:00.000Z", title: "a2" }],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe("a");
    expect(merged[0]?.title).toBe("a2");
  });
});
