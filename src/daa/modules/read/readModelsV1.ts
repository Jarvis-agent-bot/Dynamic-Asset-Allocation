import type {
  DaaStoreCashLedgerEntryV1,
  DaaStoreEquitySnapshotV1,
} from "@/src/daa/store/daaStorePgV1";
import type {
  AssetUniverseViewV1,
  RebalanceCycleV1,
  WorkbenchBootstrapV1,
  WorkbenchRebalanceCycleReportV1,
  WorkbenchTradeRecordsV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

export type OverviewReadModelV1 = {
  bootstrap: WorkbenchBootstrapV1;
  snapshots: DaaStoreEquitySnapshotV1[];
  cashLedger: DaaStoreCashLedgerEntryV1[];
  loadedAt: string;
};

export type WorkbenchReadModelV1 = {
  bootstrap: WorkbenchBootstrapV1;
  cycles: RebalanceCycleV1[];
  loadedAt: string;
};

export type TradesReadModelV1 = {
  records: WorkbenchTradeRecordsV1;
  reports: WorkbenchRebalanceCycleReportV1[];
  loadedAt: string;
};

export type StrategyLabSeedReadModelV1 = {
  bootstrap: WorkbenchBootstrapV1;
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
  availableAssets: AssetUniverseViewV1[];
  selectedAssetKeys: string[];
  loadedAt: string;
};
