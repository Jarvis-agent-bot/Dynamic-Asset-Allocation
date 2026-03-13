"use client";

import { DEFAULT_SYSTEM_CONFIG_ } from "@/src/daa/config/systemConfig";

export const DAA_RUNTIME_DATA_EVENT_ = "daa:data:updated";

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

export type UnifiedInputState = {
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

export type UnifiedInputSliceKey = keyof Omit<UnifiedInputState, "schemaVersion" | "updatedAt">;

function nowIso(): string {
  return new Date().toISOString();
}

export const DEFAULT_STRATEGY_CONFIG: DaaStrategyConfig = {
  ...JSON.parse(JSON.stringify(DEFAULT_SYSTEM_CONFIG_.strategy)),
} as DaaStrategyConfig;

export const DEFAULT_HF_FUND_REGISTRY: DaaHfFundTrackRow[] = JSON.parse(
  JSON.stringify(DEFAULT_SYSTEM_CONFIG_.dataSources.hfFund.funds),
) as DaaHfFundTrackRow[];

function defaultUnifiedInputState(): UnifiedInputState {
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

const GLOBAL_STATE_KEY_ = "__daa_unified_input_state_v1__";

function cloneState<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function getMutableState(): UnifiedInputState {
  const g = globalThis as any;
  if (!g[GLOBAL_STATE_KEY_]) {
    g[GLOBAL_STATE_KEY_] = defaultUnifiedInputState();
  } else {
    const current = g[GLOBAL_STATE_KEY_] as Partial<UnifiedInputState>;
    if (current.candidateAssets === undefined) {
      current.candidateAssets = null;
    }
  }
  return g[GLOBAL_STATE_KEY_] as UnifiedInputState;
}

function dispatchDataEvent() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_));
  } catch {
    // ignore
  }
}

export function bootstrapUnifiedInputRuntime(opts: { dispatchEvent?: boolean } = {}): UnifiedInputState {
  const current = getMutableState();
  if (opts.dispatchEvent !== false) dispatchDataEvent();
  return cloneState(current);
}

export function loadUnifiedInputState(): UnifiedInputState {
  return cloneState(getMutableState());
}

export function saveUnifiedInputState(
  nextState: UnifiedInputState,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputState {
  const current = getMutableState();
  const next: UnifiedInputState = {
    ...current,
    ...cloneState(nextState),
    schemaVersion: 1,
    updatedAt: nowIso(),
  };
  (globalThis as any)[GLOBAL_STATE_KEY_] = next;
  if (opts.dispatchEvent !== false) dispatchDataEvent();
  return cloneState(next);
}

export function patchUnifiedInputState(
  patch: Partial<Omit<UnifiedInputState, "schemaVersion" | "updatedAt">>,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputState {
  const current = getMutableState();
  const next: UnifiedInputState = {
    ...current,
    ...cloneState(patch),
    schemaVersion: 1,
    updatedAt: nowIso(),
  };
  (globalThis as any)[GLOBAL_STATE_KEY_] = next;
  if (opts.dispatchEvent !== false) dispatchDataEvent();
  return cloneState(next);
}

export function readUnifiedInputSlice<T = unknown>(sliceKey: UnifiedInputSliceKey): T | null {
  const st = getMutableState();
  return (cloneState(st[sliceKey]) as T | null) ?? null;
}

export function writeUnifiedInputSlice(
  sliceKey: UnifiedInputSliceKey,
  value: unknown,
  opts: { dispatchEvent?: boolean } = {},
): UnifiedInputState {
  return patchUnifiedInputState({ [sliceKey]: value ?? null }, opts);
}
