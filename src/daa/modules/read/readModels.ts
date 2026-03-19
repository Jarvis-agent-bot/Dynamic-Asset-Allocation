import type {
  DaaStoreCashLedgerEntry,
  DaaStoreEquitySnapshot,
} from "@/src/daa/store/daaStorePg";
import type {
  AssetUniverseView,
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchRebalanceCycleReport,
  WorkbenchTradeRecords,
} from "@/src/daa/modules/workbench/workbenchTypes";

export type WorkbenchReadModel = {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
  snapshots: DaaStoreEquitySnapshot[];
  cashLedger: DaaStoreCashLedgerEntry[];
  signals: WorkbenchSignal[];
  allocationSummary: WorkbenchAllocationSummary;
  loadedAt: string;
};

export type TradesReadModel = {
  records: WorkbenchTradeRecords;
  reports: WorkbenchRebalanceCycleReport[];
  loadedAt: string;
};

export type StrategyLabSeedReadModel = {
  bootstrap: WorkbenchBootstrap;
  baseCurrency: string;
  initialEquity: number;
  constraints: {
    maxPositionPct: number;
    minNotional: number;
    maxOrderPctOfNav: number;
  };
  policy: {
    thresholdPct: number;
    minTradeNotional: number;
    cooldownSeconds: number;
  };
  execution: {
    feeRateBps: number;
    slippageBps: number;
    maxOrderPctOfNav: number;
  };
  availableAssets: AssetUniverseView[];
  selectedAssetKeys: string[];
  loadedAt: string;
};

export type WorkbenchSignal = {
  id: string;
  level: "info" | "warn" | "success";
  source: "alert" | "warning" | "system";
  text: string;
  actionHref: string | null;
  createdAt: string;
};

export type WorkbenchAllocationSummary = {
  holdingCount: number;
  watchlistCount: number;
  holdingValue: number;
  cashValue: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number;
  topHoldings: Array<{
    assetKey: string;
    symbol: string;
    value: number;
    weightPct: number;
  }>;
};
