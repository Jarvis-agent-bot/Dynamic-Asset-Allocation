import { describe, expect, it } from "vitest";

import {
  computeHumanSignalBatchV1,
  getHumanIngestRuntimeStateV1,
  getLatestHumanSignalBatchV1,
  listFundManagerOperationsBySymbolsV1,
  listActorHoldingsV1,
  listHumanActorsV1,
  runHumanIngestV1,
} from "@/src/daa/hf/hfServiceV1";

describe("hf-service-v1", () => {
  it("默认可生成三地市场的人因信号批次", () => {
    const batch = computeHumanSignalBatchV1();

    expect(batch.mode).toBe("official_first");
    expect(batch.marketScope).toEqual(["US", "HK", "CN"]);
    expect(batch.signals.length).toBeGreaterThan(0);
    expect(batch.sources.length).toBeGreaterThan(0);
  });

  it("支持按 symbol 过滤信号", () => {
    const batch = computeHumanSignalBatchV1({ symbols: ["SPY"] });

    expect(batch.signals.length).toBe(1);
    expect(batch.signals[0]?.symbol).toBe("SPY");
  });

  it("可查询主体与持仓，并支持运行时增量采集", async () => {
    const actors = listHumanActorsV1({ marketScope: ["US"] });
    expect(actors.length).toBeGreaterThan(0);

    const actorId = actors[0]!.actorId;
    const holdings = listActorHoldingsV1(actorId, { marketScope: ["US"] });
    expect(holdings.length).toBeGreaterThan(0);

    const before = getHumanIngestRuntimeStateV1().ingestCount;
    const ingest = await runHumanIngestV1({ marketScope: ["US"] });
    const after = getHumanIngestRuntimeStateV1().ingestCount;

    expect(ingest.summary.mode).toBe("official_first");
    expect(ingest.summary.marketScope).toEqual(["US"]);
    expect(after).toBe(before + 1);

    const latest = await getLatestHumanSignalBatchV1();
    expect(latest.signals.length).toBeGreaterThan(0);
  });

  it("支持只读获取缓存批次（不触发自动采集）", async () => {
    const before = getHumanIngestRuntimeStateV1().ingestCount;
    const latest = await getLatestHumanSignalBatchV1({ autoIngestOnMiss: false });
    const after = getHumanIngestRuntimeStateV1().ingestCount;

    expect(after).toBe(before);
    expect(latest.sourceStatus).toBeDefined();
  });

  it("可按 symbol 聚合基金经理加减仓操作并按幅度排序", async () => {
    const opsMap = await listFundManagerOperationsBySymbolsV1({
      symbols: ["SPY", "0700.HK"],
      topN: 3,
    });

    const spyOps = opsMap.SPY;
    expect(spyOps).toBeDefined();
    expect(spyOps.topAdds.length).toBeGreaterThan(0);
    expect(spyOps.topAdds[0]!.deltaWeightPct).toBeGreaterThan(0);
    if (spyOps.topAdds.length >= 2) {
      expect(spyOps.topAdds[0]!.deltaWeightPct).toBeGreaterThanOrEqual(spyOps.topAdds[1]!.deltaWeightPct);
    }
    if (spyOps.topReduces.length >= 2) {
      expect(spyOps.topReduces[0]!.deltaWeightPct).toBeLessThanOrEqual(spyOps.topReduces[1]!.deltaWeightPct);
    }

    const hkOps = opsMap["0700.HK"];
    expect(hkOps).toBeDefined();
    expect(hkOps.topAdds.length).toBeGreaterThan(0);
    expect(hkOps.topAdds[0]!.sourceRef.length).toBeGreaterThan(0);
  });
});
