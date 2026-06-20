import {
  evaluatePositionMateriality,
  type PositionMaterialityOptions,
  type PositionMaterialityReason,
} from "./positionMateriality";

export type PositionPnlRow = {
  assetKey: string;
  symbol: string;
  holdingQty: number;
  costBasisInBase?: number | null;
  valuationBase?: number | null;
  unrealizedPnlPct?: number | null;
};

export type RiskTriggerAsset = {
  assetKey: string;
  symbol: string;
  pnlPct: number;
  triggerType: "stop_loss" | "take_profit";
};

export type IgnoredRiskTriggerAsset = RiskTriggerAsset & {
  ignoredReason: PositionMaterialityReason;
  holdingQty: number | null;
  valuationBase: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function resolvePositionPnlPct(row: PositionPnlRow): number | null {
  const preset = toFiniteNumber(row.unrealizedPnlPct);
  if (preset != null) return preset;

  const costBasisInBase = toFiniteNumber(row.costBasisInBase);
  const valuationBase = toFiniteNumber(row.valuationBase);
  if (costBasisInBase == null || costBasisInBase <= 0 || valuationBase == null || valuationBase <= 0) {
    return null;
  }

  return ((valuationBase - costBasisInBase) / costBasisInBase) * 100;
}

export function resolvePositionDrawdownPct(row: PositionPnlRow): number | null {
  const pnlPct = resolvePositionPnlPct(row);
  if (pnlPct == null) return null;
  return Math.max(0, -pnlPct);
}

export function collectRiskTriggerAssets(input: {
  rows: PositionPnlRow[];
  perAssetStopLossPct: number;
  perAssetTakeProfitPct: number;
  materiality?: PositionMaterialityOptions | null;
}): RiskTriggerAsset[] {
  return collectRiskTriggerEvaluation(input).triggeredAssets;
}

export function collectRiskTriggerEvaluation(input: {
  rows: PositionPnlRow[];
  perAssetStopLossPct: number;
  perAssetTakeProfitPct: number;
  materiality?: PositionMaterialityOptions | null;
}): {
  triggeredAssets: RiskTriggerAsset[];
  ignoredAssets: IgnoredRiskTriggerAsset[];
} {
  const stopLossPct = Math.max(0, input.perAssetStopLossPct) * 100;
  const takeProfitPct = Math.max(0, input.perAssetTakeProfitPct) * 100;
  const triggeredAssets: RiskTriggerAsset[] = [];
  const ignoredAssets: IgnoredRiskTriggerAsset[] = [];

  for (const row of input.rows) {
    if (!(row.holdingQty > 0)) continue;
    const pnlPct = resolvePositionPnlPct(row);
    if (pnlPct == null) continue;

    const rowHits: RiskTriggerAsset[] = [];

    if (stopLossPct > 0 && pnlPct <= -stopLossPct) {
      rowHits.push({
        assetKey: row.assetKey,
        symbol: row.symbol,
        pnlPct,
        triggerType: "stop_loss",
      });
    }

    if (takeProfitPct > 0 && pnlPct >= takeProfitPct) {
      rowHits.push({
        assetKey: row.assetKey,
        symbol: row.symbol,
        pnlPct,
        triggerType: "take_profit",
      });
    }

    if (rowHits.length === 0) continue;

    if (input.materiality) {
      const materiality = evaluatePositionMateriality(row, input.materiality);
      if (!materiality.actionable) {
        for (const hit of rowHits) {
          ignoredAssets.push({
            ...hit,
            ignoredReason: materiality.reason,
            holdingQty: materiality.holdingQty,
            valuationBase: materiality.valuationBase,
          });
        }
        continue;
      }
    }

    triggeredAssets.push(...rowHits);
  }

  return { triggeredAssets, ignoredAssets };
}
