import { describe, expect, it } from "vitest";

import {
  getLatestHumanSignalBatch,
  runHumanIngest,
} from "@/src/daa/hf/hfService";

describe("hf-service-v1", () => {
  it("可查询主体与持仓，并支持运行时增量采集", async () => {
    const ingest = await runHumanIngest({ marketScope: ["US"] });

    expect(ingest.summary.mode).toBe("official_first");
    expect(ingest.summary.marketScope).toEqual(["US"]);

    const latest = await getLatestHumanSignalBatch();
    expect(latest.signals.length).toBeGreaterThan(0);
  });

  it("支持只读获取缓存批次（不触发自动采集）", async () => {
    const latest = await getLatestHumanSignalBatch({ autoIngestOnMiss: false });
    expect(latest.sourceStatus).toBeDefined();
  });
});
