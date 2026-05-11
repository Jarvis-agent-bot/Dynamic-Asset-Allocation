import type { CalibrationDraft, OrderDraft } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";
import type {
  AssetUniverseView,
  WorkbenchExecutionExecuteInput,
  WorkbenchFeaturedAssetItem,
  WorkbenchMarketOrderPreviewResult,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";
import { getAssetDisplayName } from "@/src/daa/assetRegistry";

type CommandResult<T = undefined> = T extends undefined
  ? { ok: true; message: string } | { ok: false; message: string }
  : { ok: true; message: string; data: T } | { ok: false; message: string };

export function createManualOrderDraft(input: {
  bootstrapReady: boolean;
  busy: boolean;
  row: AssetUniverseView;
  side: "BUY" | "SELL";
}): { ok: true; draft: NonNullable<OrderDraft> } | { ok: false; message: string } {
  if (!input.bootstrapReady || input.busy) return { ok: false, message: "" };
  if (input.side === "SELL" && input.row.holdingQty <= 0) {
    return { ok: false, message: `${input.row.symbol} 无可卖持仓` };
  }
  return { ok: true, draft: { row: input.row, side: input.side } };
}

export function buildManualExecutionInput(preview: WorkbenchMarketOrderPreviewResult): WorkbenchExecutionExecuteInput {
  return {
    source: "manual",
    origin: "manual",
    side: preview.side,
    assetKey: preview.assetKey,
    symbol: preview.symbol,
    market: preview.market,
    currency: preview.currency,
    qty: preview.qty,
    price: preview.price,
    notionalInBase: preview.notionalInBase,
    fee: preview.fee,
    pricingMode: "market",
    priceSource: preview.priceSource,
    priceSnapshotAt: preview.priceSnapshotAt ?? undefined,
    reasonText: "来自市价预览",
  };
}

export function buildCalibrationDraft(row: AssetUniverseView): NonNullable<CalibrationDraft> {
  const defaultPrice = row.holdingPrice > 0 ? row.holdingPrice : (row.lastPrice > 0 ? row.lastPrice : 0);
  const defaultCostBasis = row.costBasis ?? (row.holdingQty > 0 && defaultPrice > 0 ? row.holdingQty * defaultPrice : 0);
  return {
    row,
    qty: row.holdingQty > 0 ? row.holdingQty.toFixed(6) : "0",
    holdingPrice: defaultPrice > 0 ? defaultPrice.toFixed(4) : "0",
    costBasis: defaultCostBasis > 0 ? defaultCostBasis.toFixed(2) : "",
  };
}

export function parseCalibrationDraft(draft: NonNullable<CalibrationDraft>):
  | { ok: true; patch: { holdingQty: number; holdingPrice: number; costBasis: number | null; lastPrice?: number } }
  | { ok: false; message: string } {
  const qty = Number(draft.qty);
  const holdingPrice = Number(draft.holdingPrice);
  const costBasisText = draft.costBasis.trim();
  const costBasis = costBasisText ? Number(costBasisText) : (qty > 0 && holdingPrice > 0 ? qty * holdingPrice : null);

  if (!Number.isFinite(qty) || qty < 0) {
    return { ok: false, message: "持仓数量必须是大于等于 0 的数字" };
  }
  if (!Number.isFinite(holdingPrice) || holdingPrice < 0) {
    return { ok: false, message: "持仓均价必须是大于等于 0 的数字" };
  }
  if (costBasis != null && (!Number.isFinite(costBasis) || costBasis < 0)) {
    return { ok: false, message: "总成本必须是大于等于 0 的数字" };
  }

  return {
    ok: true,
    patch: {
      holdingQty: qty,
      holdingPrice,
      costBasis,
      lastPrice: holdingPrice > 0 ? holdingPrice : undefined,
    },
  };
}

export function normalizeWatchlistTargetWeights(rows: AssetUniverseView[]):
  | { ok: true; patches: Array<{ assetKey: string; patch: { watchEnabled: true; targetWeightHint: number } }> }
  | { ok: false; message: string } {
  const watchRows = rows.filter((row) => row.watchEnabled);
  if (!watchRows.length) return { ok: false, message: "观察列表为空，无法归一化目标权重" };

  const positive = watchRows.map((row) => Math.max(0, Number(row.targetWeightHint || 0)));
  const sum = positive.reduce((acc, value) => acc + value, 0);
  const normalized = sum > 0
    ? positive.map((value) => value / sum)
    : watchRows.map(() => 1 / watchRows.length);

  return {
    ok: true,
    patches: watchRows.map((row, index) => ({
      assetKey: row.assetKey,
      patch: {
        watchEnabled: true,
        targetWeightHint: normalized[index],
      },
    })),
  };
}

export async function addWatchlistAsset(input: {
  item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem;
  upsertWorkbenchAsset: (payload: {
    symbol: string;
    market: string;
    name?: string | null;
    displayNameZh?: string | null;
    currency?: string;
    assetClass?: string;
    region?: string;
    exchange?: string;
    instrumentType?: string;
    marketGroup?: string;
    watchEnabled?: boolean;
    lastPrice?: number;
  }) => Promise<unknown>;
}): Promise<CommandResult<{ label: string }>> {
  const item = input.item;
  const name = item.longName || item.name || item.shortName || item.symbol;
  const displayNameZh = item.displayNameZh || getAssetDisplayName(item.symbol);
  await input.upsertWorkbenchAsset({
    symbol: item.symbol,
    market: item.market,
    name,
    displayNameZh,
    currency: item.currency,
    assetClass: item.assetClass,
    region: item.region,
    exchange: item.exchange,
    instrumentType: item.instrumentType,
    marketGroup: item.marketGroup,
    watchEnabled: true,
    lastPrice: item.price,
  });
  const label = displayNameZh || name || item.symbol;
  return { ok: true, message: `${label} 已加入观察列表`, data: { label } };
}

export async function removeFromWatchlist(input: {
  row: AssetUniverseView;
  patchWorkbenchAsset: (assetKey: string, patch: { watchEnabled?: boolean; targetWeightHint?: number }) => Promise<unknown>;
}): Promise<CommandResult> {
  await input.patchWorkbenchAsset(input.row.assetKey, { watchEnabled: false, targetWeightHint: 0 });
  return { ok: true, message: `${input.row.displayNameZh || input.row.name || input.row.symbol} 已移出观察列表` };
}

export async function restoreWatchlistAsset(input: {
  row: AssetUniverseView;
  patchWorkbenchAsset: (assetKey: string, patch: { watchEnabled?: boolean }) => Promise<unknown>;
}): Promise<CommandResult> {
  await input.patchWorkbenchAsset(input.row.assetKey, { watchEnabled: true });
  return { ok: true, message: `${input.row.displayNameZh || input.row.name || input.row.symbol} 已恢复到观察列表` };
}

export async function toggleBasketMembership(input: {
  row: AssetUniverseView;
  nextInBasket: boolean;
  patchWorkbenchAsset: (assetKey: string, patch: { watchEnabled: true; targetWeightHint: number }) => Promise<unknown>;
}): Promise<CommandResult> {
  await input.patchWorkbenchAsset(input.row.assetKey, {
    watchEnabled: true,
    targetWeightHint: input.nextInBasket ? (input.row.targetWeightHint > 0 ? input.row.targetWeightHint : 0.05) : 0,
  });
  return { ok: true, message: input.nextInBasket ? `${input.row.symbol} 已加入再平衡列表` : `${input.row.symbol} 已移出再平衡列表` };
}

export async function submitTargetWeightUpdate(input: {
  row: AssetUniverseView;
  targetWeightPct: number;
  patchWorkbenchAsset: (assetKey: string, patch: { targetWeightHint: number; watchEnabled: true }) => Promise<unknown>;
}): Promise<CommandResult> {
  if (!Number.isFinite(input.targetWeightPct) || input.targetWeightPct < 0) {
    return { ok: false, message: "目标权重必须是大于等于 0 的数字" };
  }
  await input.patchWorkbenchAsset(input.row.assetKey, {
    targetWeightHint: input.targetWeightPct / 100,
    watchEnabled: true,
  });
  return { ok: true, message: `${input.row.symbol} 目标权重已更新为 ${input.targetWeightPct.toFixed(2)}%` };
}

export async function submitNormalizedTargetWeights(input: {
  rows: AssetUniverseView[];
  patchWorkbenchAsset: (assetKey: string, patch: { watchEnabled: true; targetWeightHint: number }) => Promise<unknown>;
}): Promise<CommandResult<{ count: number }>> {
  const normalized = normalizeWatchlistTargetWeights(input.rows);
  if (!normalized.ok) return normalized;
  await Promise.all(normalized.patches.map((item) => input.patchWorkbenchAsset(item.assetKey, item.patch)));
  return { ok: true, message: `已归一化 ${normalized.patches.length} 个观察资产`, data: { count: normalized.patches.length } };
}
