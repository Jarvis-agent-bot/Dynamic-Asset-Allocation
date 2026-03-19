import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type {
  DaaCurrentLedgerMeta,
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
  ledgerMeta: DaaCurrentLedgerMeta;
  notificationStatus: NotificationStatusSummary;
  loadedAt: string;
};

export type TradesReadModel = {
  baseCurrency: string;
  records: WorkbenchTradeRecords;
  reports: WorkbenchRebalanceCycleReport[];
  ledgerMeta: DaaCurrentLedgerMeta;
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
