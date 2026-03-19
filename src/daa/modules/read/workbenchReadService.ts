import {
  getDaaLedgerStartTs,
  listDaaCashLedgerEntries,
  listDaaEquitySnapshots,
} from "@/src/daa/store/daaStorePg";
import {
  buildWorkbenchBootstrap,
  listWorkbenchRebalanceCycles,
} from "@/src/daa/modules/workbench/workbenchReadService";
import { nextCalendarDueDate } from "@/src/daa/modules/workbench/workbenchShared";

import type {
  WorkbenchAllocationSummary,
  WorkbenchReadModel,
  WorkbenchSignal,
} from "./readModels";

function isAfterLedgerStart(ts: string | null | undefined, ledgerStartTs: string | null): boolean {
  if (!ledgerStartTs) return true;
  if (!ts) return false;
  return Date.parse(ts) >= Date.parse(ledgerStartTs);
}

function buildSignals(input: {
  bootstrap: WorkbenchReadModel["bootstrap"];
  ledgerStartTs: string | null;
}): WorkbenchSignal[] {
  const createdAt = input.ledgerStartTs || new Date().toISOString();
  const items: WorkbenchSignal[] = [];
  const seen = new Set<string>();

  const push = (signal: WorkbenchSignal) => {
    const key = `${signal.level}:${signal.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(signal);
  };

  const maxDriftRow = (input.bootstrap.assetUniverse || [])
    .filter((row) => row.gapPct != null)
    .sort((a, b) => Math.abs(b.gapPct || 0) - Math.abs(a.gapPct || 0))[0];
  const driftThresholdPct = Number(input.bootstrap.rebalanceStrategy?.drift?.thresholdPct || 0) * 100;
  if (maxDriftRow && Math.abs(maxDriftRow.gapPct || 0) > driftThresholdPct) {
    push({
      id: `alert:drift:${maxDriftRow.assetKey}`,
      level: "warn",
      source: "alert",
      text: `${maxDriftRow.symbol} 偏移 ${Number(maxDriftRow.gapPct || 0).toFixed(2)}%，超过阈值 ${driftThresholdPct.toFixed(2)}%`,
      actionHref: "/daa/dashboard/workbench?section=portfolio&tab=watchlist",
      createdAt,
    });
  }

  const highlightedHf = (input.bootstrap.assetUniverse || []).find((row) => row.hfSignal && row.hfSignal.level !== "none");
  if (highlightedHf?.hfSignal) {
    push({
      id: `alert:hf:${highlightedHf.assetKey}`,
      level: highlightedHf.hfSignal.level === "bearish" ? "warn" : "info",
      source: "alert",
      text: `人因信号：${highlightedHf.symbol} ${highlightedHf.hfSignal.icon} ${highlightedHf.hfSignal.label}`,
      actionHref: "/daa/dashboard/workbench?section=portfolio&tab=watchlist",
      createdAt,
    });
  }

  if (input.bootstrap.rebalanceStrategy.calendar.enabled) {
    const nextDueAt = nextCalendarDueDate({
      frequency: input.bootstrap.rebalanceStrategy.calendar.frequency,
      dayOfMonth: input.bootstrap.rebalanceStrategy.calendar.dayOfMonth,
    });
    push({
      id: "alert:next-calendar-cycle",
      level: "success",
      source: "alert",
      text: `下次定期再平衡：${nextDueAt.slice(0, 10)}`,
      actionHref: "/daa/dashboard/workbench?section=rebalance",
      createdAt,
    });
  }

  for (const scope of input.bootstrap.marketContext?.scopes || []) {
    if (scope.regime !== "risk_off") continue;
    push({
      id: `alert:market:${scope.scope}`,
      level: "warn",
      source: "alert",
      text: `${scope.label}进入 偏防守，普通买入执行 ${Math.round(scope.buyScale * 100)}%，高波动买入执行 ${Math.round(scope.highRiskBuyScale * 100)}%`,
      actionHref: "/daa/dashboard/workbench?section=cockpit",
      createdAt: scope.generatedAt || createdAt,
    });
  }

  for (const warning of input.bootstrap.warnings || []) {
    push({
      id: `warning:${warning}`,
      level: "warn",
      source: "warning",
      text: warning,
      actionHref: "/daa/dashboard/workbench?section=cockpit",
      createdAt,
    });
  }

  if (input.bootstrap.marketDataHealth?.message) {
    push({
      id: "system:market-data-health",
      level: input.bootstrap.marketDataHealth.status === "ok" ? "success" : "warn",
      source: "system",
      text: input.bootstrap.marketDataHealth.message,
      actionHref: "/daa/dashboard/workbench?section=cockpit",
      createdAt,
    });
  }

  if (input.bootstrap.latestCycle) {
    push({
      id: `system:latest-cycle:${input.bootstrap.latestCycle.cycleId}`,
      level: input.bootstrap.latestCycle.status === "completed" ? "success" : "info",
      source: "system",
      text: `最近周期 ${input.bootstrap.latestCycle.cycleId.slice(0, 8)} · ${input.bootstrap.latestCycle.triggerSource} · ${input.bootstrap.latestCycle.status}`,
      actionHref: "/daa/dashboard/workbench?section=rebalance",
      createdAt: input.bootstrap.latestCycle.createdAt,
    });
  }

  const severityRank = { warn: 0, info: 1, success: 2 } as const;
  return items.sort((a, b) => {
    const levelDiff = severityRank[a.level] - severityRank[b.level];
    if (levelDiff !== 0) return levelDiff;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

function buildAllocationSummary(input: {
  bootstrap: WorkbenchReadModel["bootstrap"];
}): WorkbenchAllocationSummary {
  const assetUniverse = input.bootstrap.assetUniverse || [];
  const cashValue = input.bootstrap.account.cash ?? 0;
  const investableCash = input.bootstrap.account.investableCash ?? 0;
  const frozenCash = input.bootstrap.account.frozenCash ?? 0;
  const holdingRows = assetUniverse
    .filter((row) => row.holdingQty > 0 && (row.valuationBase || 0) > 0)
    .sort((a, b) => (b.valuationBase || 0) - (a.valuationBase || 0));
  const holdingValue = holdingRows.reduce((sum, row) => sum + (row.valuationBase || 0), 0);
  const totalEquity = holdingValue + cashValue;

  return {
    holdingCount: assetUniverse.filter((row) => row.holdingQty > 0).length,
    watchlistCount: assetUniverse.filter((row) => row.watchEnabled).length,
    holdingValue,
    cashValue,
    investableCash,
    frozenCash,
    totalEquity,
    topHoldings: holdingRows.slice(0, 5).map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      value: row.valuationBase || 0,
      weightPct: row.actualWeightPct,
    })),
  };
}

export async function buildWorkbenchReadModel(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModel> {
  const ledgerStartTs = await getDaaLedgerStartTs();
  const [bootstrap, cycles, snapshots, cashLedger] = await Promise.all([
    buildWorkbenchBootstrap({
      syncPrices: input.syncPrices ?? false,
      autoRiskCycle: input.autoRiskCycle ?? false,
    }),
    listWorkbenchRebalanceCycles(40),
    listDaaEquitySnapshots(120),
    listDaaCashLedgerEntries(20),
  ]);

  const filteredCycles = cycles.filter((cycle) => isAfterLedgerStart(cycle.createdAt, ledgerStartTs));
  const filteredSnapshots = snapshots.filter((snapshot) => isAfterLedgerStart(snapshot.ts, ledgerStartTs));
  const filteredCashLedger = cashLedger.filter((entry) => isAfterLedgerStart(entry.ts, ledgerStartTs));
  const filteredExecutionLogs = (bootstrap.execution.logs || []).filter((item) => isAfterLedgerStart(item.createdAt, ledgerStartTs));
  const filteredLatestCycle = bootstrap.latestCycle && isAfterLedgerStart(bootstrap.latestCycle.createdAt, ledgerStartTs)
    ? bootstrap.latestCycle
    : (filteredCycles[0] || null);
  const nextBootstrap = {
    ...bootstrap,
    execution: {
      ...bootstrap.execution,
      logs: filteredExecutionLogs,
    },
    latestCycle: filteredLatestCycle,
  };

  return {
    bootstrap: nextBootstrap,
    cycles: filteredCycles,
    snapshots: filteredSnapshots,
    cashLedger: filteredCashLedger,
    signals: buildSignals({ bootstrap: nextBootstrap, ledgerStartTs }),
    allocationSummary: buildAllocationSummary({ bootstrap: nextBootstrap }),
    loadedAt: new Date().toISOString(),
  };
}
