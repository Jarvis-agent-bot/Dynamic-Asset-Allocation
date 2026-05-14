import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/jobStore", () => ({
  appendDaaExternalRequestLog: vi.fn(async () => ({ id: "external_log_test" })),
}));

import {
  fetchDanjuanFundAssetPercent,
  resolveDanjuanFundRegistry,
  resolveDanjuanReportDates,
} from "@/src/daa/hf/danjuanFundSource";
import { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.DAA_HF_DANJUAN_FUNDS;
});

describe("danjuan-fund-source-v1", () => {
  it("根据环境变量覆盖基金清单", () => {
    process.env.DAA_HF_DANJUAN_FUNDS = "006533,100055";
    const registry = resolveDanjuanFundRegistry();

    expect(registry.map((x) => x.fundCode)).toEqual(["006533", "100055"]);
  });

  it("可生成最近季度披露日期", () => {
    const dates = resolveDanjuanReportDates(3);
    expect(dates.length).toBe(3);
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
  });

  it("可解析丹券持仓接口并规范化代码", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            source: "2024-12-31",
            fund_name: "测试基金",
            cash_percent: 11.2,
            stock_percent: 84.6,
            stock_list: [
              { name: "腾讯控股", code: "00700", percent: 8.76 },
              { name: "拼多多", code: "PDD", percent: 6.11 },
              { name: "深南电路", code: "002916", percent: 5.21 },
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const rows = await fetchDanjuanFundAssetPercent({
      fundCode: "100055",
      reportDate: "2024-12-31",
    });

    expect(rows.length).toBe(3);
    expect(rows[0]?.symbol).toBe("00700.HK");
    expect(rows[1]?.symbol).toBe("PDD");
    expect(rows[2]?.symbol).toBe("002916.SZ");
    expect(vi.mocked(appendDaaExternalRequestLog)).toHaveBeenCalledWith(expect.objectContaining({
      provider: "danjuan",
      resource: "danjuan.fund.asset.percent",
      subjectKey: "100055::2024-12-31",
      httpStatus: 200,
      errorCode: "",
    }));
  });
});
