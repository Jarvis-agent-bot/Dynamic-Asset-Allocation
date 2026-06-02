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
import type { TargetWeightAuditRecord } from "@/src/daa/store/targetWeightAuditStore";

export type WorkbenchReadModel = {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
  snapshots: DaaStoreEquitySnapshot[];
  cashLedger: DaaStoreCashLedgerEntry[];
  signals: WorkbenchSignal[];
  allocationSummary: WorkbenchAllocationSummary;
  equityDelta: EquityDelta;
  policySummary?: WorkbenchPolicySummary | null;
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

export type AssetDetailTradeMarker = {
  date: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
};

export type AssetDetailReadModel = {
  assetKey: string;
  row: AssetUniverseView | null;
  baseCurrency: string;
  account: Pick<WorkbenchBootstrap["account"], "cash" | "investableCash" | "frozenCash" | "totalEquity" | "valuation">;
  execution: Pick<WorkbenchBootstrap["execution"], "feeRateBps" | "slippageBps" | "minNotional">;
  tradeMarkers: AssetDetailTradeMarker[];
  targetWeightAudits: TargetWeightAuditRecord[];
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

export type EquityDelta = {
  dayChange: number | null;
  dayChangePct: number | null;
  weekChange: number | null;
  weekChangePct: number | null;
};

export type WorkbenchPolicySummary = {
  cycleId: string;
  decisionId: string;
  action: string;
  score: number;
  threshold: number;
  noTradeBandState: string;
  blockers: string[];
  reasons: string[];
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
  equitySource: "derived_mark_to_market" | "account_state_override";
  derivedTotalEquity: number;
  fxMissingAssetKeys: string[];
  topHoldings: Array<{
    assetKey: string;
    symbol: string;
    value: number;
    weightPct: number;
  }>;
};
