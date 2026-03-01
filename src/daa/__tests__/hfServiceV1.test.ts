import { describe, expect, it } from "vitest";

import {
  computeHumanSignalBatchV1,
  getHumanIngestRuntimeStateV1,
  getLatestHumanSignalBatchV1,
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
});
