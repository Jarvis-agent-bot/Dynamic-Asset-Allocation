import { describe, expect, it, vi } from "vitest";

import {
  buildCalibrationDraft,
  buildManualExecutionInput,
  createManualOrderDraft,
  normalizeWatchlistTargetWeights,
  parseCalibrationDraft,
  submitTargetWeightUpdate,
} from "./assetActionCommands";
import type {
  AssetUniverseView,
  WorkbenchMarketOrderPreviewResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

function makeRow(overrides?: Partial<AssetUniverseView>): AssetUniverseView {
  return {
    assetKey: "US:AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    watchEnabled: true,
    holdingQty: 10,
    holdingPrice: 175,
    costBasis: 1750,
    targetWeightHint: 0.2,
    lastPrice: 180,
    ...overrides,
  } as AssetUniverseView;
}

function makePreview(overrides?: Partial<WorkbenchMarketOrderPreviewResult>): WorkbenchMarketOrderPreviewResult {
  return {
    side: "BUY",
    assetKey: "US:AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    qty: 2,
    price: 180,
    notionalInBase: 360,
    fee: 1,
    priceSource: "test",
    priceSnapshotAt: "2026-04-26T00:00:00.000Z",
    ...overrides,
  } as WorkbenchMarketOrderPreviewResult;
}

describe("assetActionCommands", () => {
  it("blocks sell manual order when there is no holding", () => {
    const result = createManualOrderDraft({
      bootstrapReady: true,
      busy: false,
      row: makeRow({ holdingQty: 0 }),
      side: "SELL",
    });

    expect(result).toEqual({
      ok: false,
      message: "AAPL 无可卖持仓",
    });
  });

  it("creates manual order draft when action is allowed", () => {
    const row = makeRow();
    const result = createManualOrderDraft({
      bootstrapReady: true,
      busy: false,
      row,
      side: "BUY",
    });

    expect(result).toEqual({
      ok: true,
      draft: { row, side: "BUY" },
    });
  });

  it("builds calibration draft from holding price and cost basis", () => {
    expect(buildCalibrationDraft(makeRow())).toMatchObject({
      qty: "10.000000",
      holdingPrice: "175.0000",
      costBasis: "1750.00",
    });
  });

  it("rejects invalid calibration draft before API mutation", () => {
    const draft = buildCalibrationDraft(makeRow());
    expect(parseCalibrationDraft({ ...draft, qty: "-1" })).toEqual({
      ok: false,
      message: "持仓数量必须是大于等于 0 的数字",
    });
  });

  it("rejects target normalization when watchlist is empty", () => {
    expect(normalizeWatchlistTargetWeights([
      makeRow({ watchEnabled: false }),
    ])).toEqual({
      ok: false,
      message: "观察列表为空，无法归一化目标权重",
    });
  });

  it("normalizes watchlist target weights by existing positive weights", () => {
    const patches = normalizeWatchlistTargetWeights([
      makeRow({ assetKey: "US:AAPL", targetWeightHint: 0.2 }),
      makeRow({ assetKey: "US:MSFT", targetWeightHint: 0.3 }),
      makeRow({ assetKey: "US:GOOG", watchEnabled: false, targetWeightHint: 0.5 }),
    ]);

    expect(patches).toEqual({
      ok: true,
      patches: [
        { assetKey: "US:AAPL", patch: { watchEnabled: true, targetWeightHint: 0.4 } },
        { assetKey: "US:MSFT", patch: { watchEnabled: true, targetWeightHint: 0.6 } },
      ],
    });
  });

  it("builds manual execution input from preview", () => {
    expect(buildManualExecutionInput(makePreview())).toMatchObject({
      source: "manual",
      origin: "manual",
      assetKey: "US:AAPL",
      symbol: "AAPL",
      reasonText: "来自市价预览",
    });
  });

  it("submits target weight as decimal patch", async () => {
    const patchWorkbenchAsset = vi.fn().mockResolvedValue(makeRow());
    const result = await submitTargetWeightUpdate({
      row: makeRow(),
      targetWeightPct: 12.5,
      patchWorkbenchAsset,
    });

    expect(result).toEqual({ ok: true, message: "AAPL 目标权重已更新为 12.50%" });
    expect(patchWorkbenchAsset).toHaveBeenCalledWith("US:AAPL", {
      targetWeightHint: 0.125,
      watchEnabled: true,
    });
  });

  it("rejects negative target weight before API mutation", async () => {
    const patchWorkbenchAsset = vi.fn();
    const result = await submitTargetWeightUpdate({
      row: makeRow(),
      targetWeightPct: -1,
      patchWorkbenchAsset,
    });

    expect(result).toEqual({ ok: false, message: "目标权重必须是大于等于 0 的数字" });
    expect(patchWorkbenchAsset).not.toHaveBeenCalled();
  });
});
