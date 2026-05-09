import {
  getDaaCurrentLedgerMeta,
  listDaaCashLedgerEntries,
  listDaaEquitySnapshots,
  type DaaStoreEquitySnapshot,
} from "@/src/daa/store/daaStorePg";
import {
  buildWorkbenchBootstrapBundle,
} from "@/src/daa/modules/workbench/workbenchReadService";
import { buildNotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import { nextCalendarDueDate } from "@/src/daa/modules/workbench/rebalanceCalendar";

import type {
  EquityDelta,
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
  notificationStatus: WorkbenchReadModel["notificationStatus"];
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
      actionHref: "/daa/dashboard/portfolio?tab=watchlist",
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
      actionHref: "/daa/dashboard/portfolio?tab=watchlist",
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
      actionHref: "/daa/dashboard/rebalance",
      createdAt,
    });
  }

  const riskOffScopes = (input.bootstrap.marketContext?.scopes || []).filter((scope) => scope.regime === "risk_off");
  if (riskOffScopes.length > 0) {
    const labels = riskOffScopes.map((scope) => scope.label).filter(Boolean);
    const strongestScope = [...riskOffScopes].sort((a, b) => (b.buyScale + b.highRiskBuyScale) - (a.buyScale + a.highRiskBuyScale))[0] || riskOffScopes[0];
    push({
      id: "alert:market:risk-off-summary",
      level: "warn",
      source: "alert",
      text: `${labels.join(" / ")}进入偏防守，常规标的建议仓位 ${Math.round(strongestScope.buyScale * 100)}%，高波动标的建议仓位 ${Math.round(strongestScope.highRiskBuyScale * 100)}%。`,
      actionHref: "/daa/dashboard/rebalance",
      createdAt: strongestScope.generatedAt || createdAt,
    });
  }

  for (const warning of input.bootstrap.warnings || []) {
    push({
      id: `warning:${warning}`,
      level: "warn",
      source: "warning",
      text: warning,
      actionHref: "/daa/dashboard/portfolio",
      createdAt,
    });
  }

  if (input.bootstrap.marketDataHealth?.message && input.bootstrap.marketDataHealth.status !== "ok") {
    push({
      id: "system:market-data-health",
      level: "warn",
      source: "system",
      text: input.bootstrap.marketDataHealth.message,
      actionHref: "/daa/dashboard/settings#settings-data",
      createdAt,
    });
  }

  const notificationStatus = input.notificationStatus;
  const notificationEnabled = notificationStatus.channels.telegram.enabled || notificationStatus.channels.feishu.enabled;
  if (!notificationStatus.cronConfigured && (input.bootstrap.rebalance.autoAnalysisEnabled || notificationEnabled)) {
    push({
      id: "warning:notification:cron-token",
      level: "warn",
      source: "warning",
      text: "定时任务 Token 未配置，自动分析与每日报告类通知不会按计划触发。",
      actionHref: "/daa/dashboard/settings#settings-notification",
      createdAt,
    });
  }

  for (const [channelKey, label] of [
    ["telegram", "Telegram"],
    ["feishu", "飞书"],
  ] as const) {
    const channel = notificationStatus.channels[channelKey];
    if (!channel.enabled) continue;
    if (!channel.configured) {
      push({
        id: `warning:notification:${channelKey}:secret-missing`,
        level: "warn",
        source: "warning",
        text: `${label} 已启用，但凭证未配置完整；当前不会有实际推送。`,
        actionHref: "/daa/dashboard/settings#settings-notification",
        createdAt,
      });
      continue;
    }

    const lastFailureMs = channel.lastFailureAt ? Date.parse(channel.lastFailureAt) : Number.NaN;
    const lastSuccessMs = channel.lastSuccessAt ? Date.parse(channel.lastSuccessAt) : Number.NaN;
    if (Number.isFinite(lastFailureMs) && (!Number.isFinite(lastSuccessMs) || lastFailureMs >= lastSuccessMs)) {
      push({
        id: `warning:notification:${channelKey}:delivery-failed`,
        level: "warn",
        source: "warning",
        text: `${label} 最近一次投递失败${channel.lastErrorMessage ? `：${channel.lastErrorMessage}` : ""}`,
        actionHref: "/daa/dashboard/settings#settings-notification",
        createdAt: channel.lastFailureAt || createdAt,
      });
      continue;
    }

    if (channel.deliveryEvents.length > 0 && !channel.lastAttemptAt) {
      push({
        id: `system:notification:${channelKey}:no-delivery-yet`,
        level: "info",
        source: "system",
        text: `${label} 已启用，但当前还没有任何投递记录。`,
        actionHref: "/daa/dashboard/settings#settings-notification",
        createdAt,
      });
    }
  }

  if (notificationStatus.channels.telegram.configured && !notificationStatus.telegramAssistant.ready) {
    const missing = notificationStatus.telegramAssistant.secretStates
      .filter((item) => !item.configured)
      .map((item) => item.key)
      .join(" / ");
    push({
      id: "warning:telegram-assistant:not-ready",
      level: "warn",
      source: "warning",
      text: `Telegram 通知已可用，但对话助手还没就绪${missing ? `；缺少 ${missing}` : ""}。`,
      actionHref: "/daa/dashboard/settings#settings-notification",
      createdAt,
    });
  }

  if (input.bootstrap.latestCycle) {
    push({
      id: `system:latest-cycle:${input.bootstrap.latestCycle.cycleId}`,
      level: input.bootstrap.latestCycle.status === "completed" ? "success" : "info",
      source: "system",
      text: `最近周期 ${input.bootstrap.latestCycle.cycleId.slice(0, 8)} · ${input.bootstrap.latestCycle.triggerSource} · ${input.bootstrap.latestCycle.status}`,
      actionHref: "/daa/dashboard/rebalance",
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
  const valuation = input.bootstrap.account.valuation;
  const holdingRows = assetUniverse
    .filter((row) => row.holdingQty > 0 && (row.valuationBase || 0) > 0)
    .sort((a, b) => (b.valuationBase || 0) - (a.valuationBase || 0));
  const holdingValue = valuation?.holdingsValue
    ?? holdingRows.reduce((sum, row) => sum + (row.valuationBase || 0), 0);
  const totalEquity = valuation?.totalEquity
    ?? input.bootstrap.account.totalEquity
    ?? (holdingValue + cashValue);

  return {
    holdingCount: assetUniverse.filter((row) => row.holdingQty > 0).length,
    watchlistCount: assetUniverse.filter((row) => row.watchEnabled).length,
    holdingValue,
    cashValue,
    investableCash,
    frozenCash,
    totalEquity,
    equitySource: valuation?.equitySource ?? "derived_mark_to_market",
    derivedTotalEquity: valuation?.derivedTotalEquity ?? (holdingValue + cashValue),
    fxMissingAssetKeys: valuation?.fxMissingAssetKeys ?? assetUniverse.filter((row) => row.fxMissing).map((row) => row.assetKey),
    topHoldings: holdingRows.slice(0, 5).map((row) => ({
      assetKey: row.assetKey,
      symbol: row.symbol,
      value: row.valuationBase || 0,
      weightPct: row.actualWeightPct,
    })),
  };
}

function getWeekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday as week start
  d.setDate(d.getDate() - diff);
  return d;
}

function buildEquityDelta(input: {
  currentEquity: number;
  snapshots: DaaStoreEquitySnapshot[];
}): EquityDelta {
  const { currentEquity, snapshots } = input;
  const nil: EquityDelta = { dayChange: null, dayChangePct: null, weekChange: null, weekChangePct: null };
  if (snapshots.length === 0 || !(currentEquity > 0)) return nil;

  const now = new Date();
  const todayStartIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStartIso = getWeekStart(now).toISOString();

  // snapshots 按时间降序（最新在前），找最近一条早于今日的快照作为日初基准
  const sorted = [...snapshots].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const dayBaseSnap = sorted.find((s) => s.ts < todayStartIso);
  const weekBaseSnap = sorted.find((s) => s.ts < weekStartIso);

  let dayChange: number | null = null;
  let dayChangePct: number | null = null;
  if (dayBaseSnap && dayBaseSnap.totalEquity > 0) {
    dayChange = currentEquity - dayBaseSnap.totalEquity;
    dayChangePct = (dayChange / dayBaseSnap.totalEquity) * 100;
  }

  let weekChange: number | null = null;
  let weekChangePct: number | null = null;
  if (weekBaseSnap && weekBaseSnap.totalEquity > 0) {
    weekChange = currentEquity - weekBaseSnap.totalEquity;
    weekChangePct = (weekChange / weekBaseSnap.totalEquity) * 100;
  }

  return { dayChange, dayChangePct, weekChange, weekChangePct };
}

export async function buildWorkbenchReadModel(input: {
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}): Promise<WorkbenchReadModel> {
  const [{ bootstrap, cycles }, snapshots, cashLedger, ledgerMeta, notificationStatus] = await Promise.all([
    buildWorkbenchBootstrapBundle({
      syncPrices: input.syncPrices ?? false,
      autoRiskCycle: input.autoRiskCycle ?? false,
    }),
    listDaaEquitySnapshots(120),
    listDaaCashLedgerEntries(20),
    getDaaCurrentLedgerMeta(),
    buildNotificationStatusSummary(),
  ]);
  const ledgerStartTs = ledgerMeta.ledgerStartTs;

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
    signals: buildSignals({ bootstrap: nextBootstrap, ledgerStartTs, notificationStatus }),
    allocationSummary: buildAllocationSummary({ bootstrap: nextBootstrap }),
    equityDelta: buildEquityDelta({
      currentEquity: nextBootstrap.account.totalEquity ?? 0,
      snapshots: filteredSnapshots,
    }),
    ledgerMeta,
    notificationStatus,
    loadedAt: new Date().toISOString(),
  };
}
