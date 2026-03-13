import { describe, expect, it } from "vitest";

import {
  computeHumanSignalBatch,
  getHumanIngestRuntimeState,
  getLatestHumanSignalBatch,
  listFundManagerOperationsBySymbols,
  listActorHoldings,
  listHumanActors,
  runHumanIngest,
} from "@/src/daa/hf/hfService";

describe("hf-service-v1", () => {
  it("默认可生成三地市场的人因信号批次", () => {
    const batch = computeHumanSignalBatch();

    expect(batch.mode).toBe("official_first");
    expect(batch.marketScope).toEqual(["US", "HK", "CN"]);
    expect(batch.signals.length).toBeGreaterThan(0);
    expect(batch.sources.length).toBeGreaterThan(0);
  });

  it("支持按 symbol 过滤信号", () => {
    const batch = computeHumanSignalBatch({ symbols: ["SPY"] });

    expect(batch.signals.length).toBe(1);
    expect(batch.signals[0]?.symbol).toBe("SPY");
  });

  it("可查询主体与持仓，并支持运行时增量采集", async () => {
    const actors = listHumanActors({ marketScope: ["US"] });
    expect(actors.length).toBeGreaterThan(0);

    const actorId = actors[0]!.actorId;
    const holdings = listActorHoldings(actorId, { marketScope: ["US"] });
    expect(holdings.length).toBeGreaterThan(0);

    const before = getHumanIngestRuntimeState().ingestCount;
    const ingest = await runHumanIngest({ marketScope: ["US"] });
    const after = getHumanIngestRuntimeState().ingestCount;

    expect(ingest.summary.mode).toBe("official_first");
    expect(ingest.summary.marketScope).toEqual(["US"]);
    expect(after).toBe(before + 1);

    const latest = await getLatestHumanSignalBatch();
    expect(latest.signals.length).toBeGreaterThan(0);
  });

  it("支持只读获取缓存批次（不触发自动采集）", async () => {
    const before = getHumanIngestRuntimeState().ingestCount;
    const latest = await getLatestHumanSignalBatch({ autoIngestOnMiss: false });
    const after = getHumanIngestRuntimeState().ingestCount;

    expect(after).toBe(before);
    expect(latest.sourceStatus).toBeDefined();
  });

  it("可按 symbol 聚合基金经理加减仓操作并按幅度排序", async () => {
    const opsMap = await listFundManagerOperationsBySymbols({
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
