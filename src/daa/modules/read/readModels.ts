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

export type OverviewReadModel = {
  bootstrap: WorkbenchBootstrap;
  snapshots: DaaStoreEquitySnapshot[];
  cashLedger: DaaStoreCashLedgerEntry[];
  loadedAt: string;
};

export type WorkbenchReadModel = {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
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
