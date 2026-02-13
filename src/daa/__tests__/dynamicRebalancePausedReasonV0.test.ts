import { describe, expect, it } from "vitest";

import { computeDynamicRebalancePauseReasonV0 } from "../dynamicRebalancePausedReasonV0";

describe("computeDynamicRebalancePauseReasonV0", () => {
  it("returns null when disabled", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 2, 0, 0)); // 2026-02-13 10:00 Asia/Shanghai
    expect(
      computeDynamicRebalancePauseReasonV0({
        enabled: false,
        now,
        priceSnapshotUpdatedAt: now.toISOString(),
        priceCount: 10,
      })
    ).toBeNull();
  });

  it("pauses when market is closed (weekend)", () => {
    const now = new Date(Date.UTC(2026, 1, 14, 2, 0, 0)); // Sat 2026-02-14 10:00 Asia/Shanghai
    const r = computeDynamicRebalancePauseReasonV0({ enabled: true, now, priceSnapshotUpdatedAt: now.toISOString(), priceCount: 10 });
    expect(r?.kind).toBe("paused-market-closed");
  });

  it("pauses when before morning open on a weekday", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 0, 0, 0)); // 2026-02-13 08:00 Asia/Shanghai
    const r = computeDynamicRebalancePauseReasonV0({ enabled: true, now, priceSnapshotUpdatedAt: now.toISOString(), priceCount: 10 });
    expect(r?.kind).toBe("paused-market-closed");
    expect(r?.detail).toMatch(/Next open:/);
  });

  it("stalls when market is open but prices are missing", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 2, 0, 0)); // 2026-02-13 10:00 Asia/Shanghai
    const r = computeDynamicRebalancePauseReasonV0({ enabled: true, now, priceSnapshotUpdatedAt: now.toISOString(), priceCount: 0 });
    expect(r?.kind).toBe("stalled-data-stale");
  });

  it("stalls when market is open and price snapshot is stale", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 2, 0, 0)); // 2026-02-13 10:00 Asia/Shanghai
    const updatedAt = new Date(now.getTime() - 120 * 60 * 1000).toISOString();
    const r = computeDynamicRebalancePauseReasonV0({
      enabled: true,
      now,
      priceSnapshotUpdatedAt: updatedAt,
      priceCount: 10,
      staleAfterMin: 60,
    });
    expect(r?.kind).toBe("stalled-data-stale");
  });

  it("returns null when market is open and price snapshot is fresh", () => {
    const now = new Date(Date.UTC(2026, 1, 13, 2, 0, 0)); // 2026-02-13 10:00 Asia/Shanghai
    const updatedAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const r = computeDynamicRebalancePauseReasonV0({
      enabled: true,
      now,
      priceSnapshotUpdatedAt: updatedAt,
      priceCount: 10,
      staleAfterMin: 60,
    });
    expect(r).toBeNull();
  });
});
