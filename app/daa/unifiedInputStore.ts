"use client";

import { DEFAULT_SYSTEM_CONFIG_V2 } from "@/src/daa/config/systemConfigV2";

export const DAA_RUNTIME_DATA_EVENT_V1 = "daa:data:updated";

export type DaaPositionRow = {
  id?: string;
  assetKey?: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis?: number;
  tags: string[];
};

export type DaaAnalystRow = {
  analystId: string;
  accuracyPct: number;
  riskControlPct: number;
  disciplinePct: number;
  transparencyPct: number;
  stance: "offensive" | "neutral" | "defensive";
  styleCluster: string;
};

export type DaaAssetViewRow = {
  symbol: string;
  analystId: string;
  convictionPct: number;
  thesisDriftPct: number;
  momentumRegime: "strong" | "neutral" | "weak";
};

export type DaaHfFundTrackRow = {
  fundCode: string;
  label: string;
  kind: "equity" | "qdii" | "balanced";
  enabled: boolean;
};

export type DaaCandidateAssetRow = {
  id?: string;
  symbol: string;
  name?: string | null;
  market: string;
  currency: string;
  enabled: boolean;
  targetWeightHint: number;
  currentPrice?: number | null;
  priceChangePct?: number | null;
  priceUpdatedAt?: string | null;
  tags: string[];
  notes?: string | null;
};

export type DaaFxRateRow = {
  id?: string;
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source: string;
  asOfTs?: string;
};

export type DaaStrategyConfig = {
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  constraints: {
    maxPositionPct: number;
    minNotional: number;
    maxOrderPctOfNav: number;
  };
  policy: {
    baseDriftTriggerPct: number;
    strongTrendDriftTriggerPct: number;
    riskOffConsensusPct: number;
    riskOffScalePct: number;
    valueTrapThesisDriftPct: number;
    sbIsolationScorePct: number;
  };
  risk: {
    maxDrawdownPct: number;
    perAssetStopLossPct: number;
    perAssetTakeProfitPct: number;
    maxConcentrationPct: number;
    correlationCapPct: number;
    maxTotalRiskExposurePct: number;
  };
  targetWeights: Record<string, number>;
};

export type DaaRunHistoryEntry = {
  id: string;
  ts: string;
  request: unknown;
  response: unknown;
};

export type DaaEquitySnapshot = {
  ts: string;
  equity: number;
  holdingsValue: number;
  cash: number;
  source: "auto" | "run" | "refresh" | "execution_event" | "cash_ledger";
};

export type DaaCashLedgerEntry = {
  id: string;
  ts: string;
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency: string;
  note?: string | null;
};

export type UnifiedInputStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  positions: DaaPositionRow[] | null;
  analysts: DaaAnalystRow[] | null;
  assetViews: DaaAssetViewRow[] | null;
  hfFundRegistry: DaaHfFundTrackRow[] | null;
  candidateAssets: DaaCandidateAssetRow[] | null;
  fxRates: DaaFxRateRow[] | null;
  strategyConfig: DaaStrategyConfig | null;
  lastRunResult: unknown | null;
  syncLog: string[] | null;
  runHistory: DaaRunHistoryEntry[] | null;
  equitySnapshots: DaaEquitySnapshot[] | null;
  cashLedger: DaaCashLedgerEntry[] | null;
  opLog: string[] | null;
};

export type UnifiedInputSliceKeyV1 = keyof Omit<UnifiedInputStateV1, "schemaVersion" | "updatedAt">;

function nowIso(): string {
  return new Date().toISOString();
}

export const DEFAULT_STRATEGY_CONFIG: DaaStrategyConfig = {
  ...JSON.parse(JSON.stringify(DEFAULT_SYSTEM_CONFIG_V2.strategy)),
} as DaaStrategyConfig;

export const DEFAULT_HF_FUND_REGISTRY: DaaHfFundTrackRow[] = JSON.parse(
  JSON.stringify(DEFAULT_SYSTEM_CONFIG_V2.dataSources.hfFund.funds),
) as DaaHfFundTrackRow[];

function defaultUnifiedInputStateV1(): UnifiedInputStateV1 {
  return {
    schemaVersion: 1,
    updatedAt: nowIso(),
    positions: null,
    analysts: null,
    assetViews: null,
    hfFundRegistry: null,
    candidateAssets: null,
    fxRates: null,
    strategyConfig: null,
    lastRunResult: null,
    syncLog: null,
    runHistory: null,
    equitySnapshots: null,
    cashLedger: null,
    opLog: null,
  };
}

const GLOBAL_STATE_KEY_V1 = "__daa_unified_input_state_v1__";

function cloneStateV1<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function getMutableStateV1(): UnifiedInputStateV1 {
  const g = globalThis as any;
  if (!g[GLOBAL_STATE_KEY_V1]) {
    g[GLOBAL_STATE_KEY_V1] = defaultUnifiedInputStateV1();
  } else {
    const current = g[GLOBAL_STATE_KEY_V1] as Partial<UnifiedInputStateV1>;
    if (current.candidateAssets === undefined) {
      current.candidateAssets = null;
    }
  }
  return g[GLOBAL_STATE_KEY_V1] as UnifiedInputStateV1;
}

function dispatchDataEventV1() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_V1));
  } catch {
    // ignore
  }
}

export function bootstrapUnifiedInputRuntimeV1(opts: { dispatchEvent?: boolean } = {}): UnifiedInputStateV1 {
  const current = getMutableStateV1();
  if (opts.dispatchEvent !== false) dispatchDataEventV1();
  return cloneStateV1(current);
}

export function loadUnifiedInputStateV1(): UnifiedInputStateV1 {
  return cloneStateV1(getMutableStateV1());
}

export function saveUnifiedInputStateV1(
  nextState: UnifiedInputStateV1,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputStateV1 {
  const current = getMutableStateV1();
  const next: UnifiedInputStateV1 = {
    ...current,
    ...cloneStateV1(nextState),
    schemaVersion: 1,
    updatedAt: nowIso(),
  };
  (globalThis as any)[GLOBAL_STATE_KEY_V1] = next;
  if (opts.dispatchEvent !== false) dispatchDataEventV1();
  return cloneStateV1(next);
}

export function patchUnifiedInputStateV1(
  patch: Partial<Omit<UnifiedInputStateV1, "schemaVersion" | "updatedAt">>,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputStateV1 {
  const current = getMutableStateV1();
  const next: UnifiedInputStateV1 = {
    ...current,
    ...cloneStateV1(patch),
    schemaVersion: 1,
    updatedAt: nowIso(),
  };
  (globalThis as any)[GLOBAL_STATE_KEY_V1] = next;
  if (opts.dispatchEvent !== false) dispatchDataEventV1();
  return cloneStateV1(next);
}

export function readUnifiedInputSliceV1<T = unknown>(sliceKey: UnifiedInputSliceKeyV1): T | null {
  const st = getMutableStateV1();
  return (cloneStateV1(st[sliceKey]) as T | null) ?? null;
}

export function writeUnifiedInputSliceV1(
  sliceKey: UnifiedInputSliceKeyV1,
  value: unknown,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputStateV1 {
  return patchUnifiedInputStateV1({ [sliceKey]: value ?? null }, opts);
}
