import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  appendDaaCashLedgerEntry: vi.fn(async () => ({
    entry: { id: "cash-1" },
    account: { baseCurrency: "USD", cash: 1000, investableCash: 1000, frozenCash: 0, totalEquity: 1000 },
    equitySnapshot: { ts: "2026-03-20T00:00:00.000Z", totalEquity: 1000, holdingsValue: 0, cash: 1000, source: "manual" },
  })),
  listDaaCashLedgerEntries: vi.fn(async () => []),
}));

import { GET, POST } from "@/app/api/daa/store/cash-ledger/route";
import { appendDaaCashLedgerEntry } from "@/src/daa/store/daaStorePg";

describe("cash-ledger-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET 返回现金流水", async () => {
    const response = await GET(new Request("http://localhost/api/daa/store/cash-ledger"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.entries)).toBe(true);
  });

  it("POST 正常写入现金流水", async () => {
    const response = await POST(new Request("http://localhost/api/daa/store/cash-ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ side: "deposit", amount: 100, baseCurrency: "USD" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(vi.mocked(appendDaaCashLedgerEntry)).toHaveBeenCalledWith({
      side: "deposit",
      amount: 100,
      baseCurrency: "USD",
      note: undefined,
    });
  });
});
