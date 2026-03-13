import { normalizeDaaCurrencyCode, normalizeDaaSymbol, parseDaaAssetKey } from "@/src/daa/assetKey";
import type { DaaMarketContext, DaaMarketRegime } from "@/src/daa/modules/marketContext/marketContextTypes";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { runLlmAnalysis } from "@/src/daa/llm/llmAnalysis";
import { runLlmDecision } from "@/src/daa/llm/llmDecision";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import { hydrateUnifiedRequestWithSignals } from "@/src/daa/modules/decision/hydrateUnifiedRequest";
import type { UnifiedDecisionResult } from "@/src/daa/modules/decision/decisionResultTypes";
import {
  buildMarketContextAttribution,
  getCurrentMarketContext,
  marketRegimeLabelZh,
} from "@/src/daa/modules/marketContext/marketIndicatorService";
import { classifyCash } from "./cashClassification";
import { fuseDecision } from "./decisionFusion";
import {
  appendDaaTriggerEvent,
  appendDaaRunHistory,
  appendAssetPriceHistoryRows,
  createDaaRebalanceCycle,
  createDaaRebalanceDecision,
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaHumanIngestState,
  getDaaRebalanceCycle,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  listDaaAssetUniverse,
  listDaaEquitySnapshots,
  listDaaFxRates,
  listDaaRebalanceCycles,
  listDaaTradeTickets,
  patchDaaRebalanceCycle,
  upsertDaaCycleReport,
  updateDaaAssetUniverseLastPrice,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { buildDaaUnifiedPlan, type DaaUnifiedRequest } from "@/src/daa/unifiedRebalance";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";

import { buildAssetUniverseViewRows } from "./assetUniverseService";
import type {
  ExecuteRebalanceSummary,
  ExecuteRebalanceCycleResult,
  GenerateRebalanceCycleInput,
  GenerateRebalanceCycleResult,
  HfSignalSummary,
  PortfolioHealthyInsight,
  PreTradeRiskCheckItem,
  PreTradeRiskCheck,
  RebalanceCycle,
  RebalanceProposal,
  RebalanceTriggerSource,
  UpdateRebalanceCycleInput,
  WorkbenchBootstrap,
  WorkbenchRecommendation,
  WorkbenchRecommendationsResult,
} from "./workbenchTypes";

import { buildUnifiedRequestFromStore, buildWorkbenchBootstrap } from "./workbenchReadService";
import { validateExecutionRisk } from "./workbenchExecutionService";
import {
  appendTriggerEventSafe,
  assertCycleExecutable,
  assertCycleMutable,
  buildCalendarPeriodKey,
  buildMarketFacts,
  buildCycleDraftFromBootstrap,
  buildPreTradeRiskCheck,
  buildPreTradeRiskCheckFromBootstrap,
  buildRiskCycleDraft,
  calcHoldingCostPerUnit,
  getZonedYmd,
  isCalendarMonthDue,
  isPastUtcTime,
  mapStoreCycleToView,
  normalizeText,
  normalizeTimeZoneOrUtc,
  pickCycleMarketRegimes,
  toCycleReportSnapshot,
  toFinite,
  toIsoByMs,
} from "./workbenchShared";

export async function generateWorkbenchRebalanceCycle(
  input: GenerateRebalanceCycleInput = {},
): Promise<GenerateRebalanceCycleResult> {
  const triggerSource: RebalanceTriggerSource = input.triggerSource || "manual";
  const manual = input.manual === true || triggerSource === "manual";

  const [bootstrap, systemRow, recentCycles] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: true }),
    getDaaSystemConfig(),
    listDaaRebalanceCycles(120),
  ]);

  const latestCycle = recentCycles[0] || null;
  const strategy = systemRow.config.rebalanceStrategy;
  const marketContext = bootstrap.marketContext || null;
  const now = new Date();
  let cooldownReferenceCycle: DaaStoreRebalanceCycle | null = latestCycle;
  const skipWithLatest = (message: string, options: {
    skippedByCooldown?: boolean;
    cooldownUntil?: string | null;
    attachLatestCycle?: boolean;
  } = {}): GenerateRebalanceCycleResult => {
    const attachedCycle = options.attachLatestCycle ? (cooldownReferenceCycle || latestCycle) : null;
    void appendTriggerEventSafe({
      triggerSource,
      triggerReason: message,
      cycleId: attachedCycle?.cycleId || null,
      status: options.skippedByCooldown ? "conflict" : "skipped",
      detailsJson: {
        skippedByCooldown: options.skippedByCooldown === true,
        cooldownUntil: options.cooldownUntil || null,
      },
    });
    return {
      cycle: attachedCycle ? mapStoreCycleToView(attachedCycle) : null,
      created: false,
      skippedByCooldown: options.skippedByCooldown === true,
      cooldownUntil: options.cooldownUntil || null,
      message,
      portfolioStatus: "skipped",
      marketRegime: (attachedCycle ? mapStoreCycleToView(attachedCycle)?.marketContext?.regime : null) || marketContext?.regime || null,
      llmSummary: null,
    };
  };

  if (!manual && triggerSource === "calendar") {
    if (!strategy.calendar.enabled) {
      return skipWithLatest("定期再平衡未启用，跳过自动生成。");
    }

    if (!isPastUtcTime(now, strategy.analysisTimeUtc)) {
      return skipWithLatest(`未到定时分析窗口（UTC ${strategy.analysisTimeUtc}）`);
    }

    const timeZone = normalizeTimeZoneOrUtc(strategy.timezone);
    const today = getZonedYmd(now, timeZone);
    const dueDay = Math.max(1, Math.min(28, Math.trunc(strategy.calendar.dayOfMonth || 1)));
    if (today.day !== dueDay || !isCalendarMonthDue(today.month, strategy.calendar.frequency)) {
      return skipWithLatest(
        `当前不在定期再平衡窗口（${timeZone} 每${strategy.calendar.frequency === "monthly"
          ? "月"
          : (strategy.calendar.frequency === "quarterly"
            ? "季"
            : (strategy.calendar.frequency === "semi_annual" ? "半年" : "年"))}${dueDay}日）`,
      );
    }

    const currentPeriodKey = buildCalendarPeriodKey({
      date: now,
      timeZone,
      frequency: strategy.calendar.frequency,
    });
    const duplicated = recentCycles.some((row) => {
      if (row.triggerSource !== "calendar") return false;
      const ms = Date.parse(row.createdAt || row.snapshotAt);
      if (!Number.isFinite(ms)) return false;
      const rowPeriodKey = buildCalendarPeriodKey({
        date: new Date(ms),
        timeZone,
        frequency: strategy.calendar.frequency,
      });
      return rowPeriodKey === currentPeriodKey;
    });
    if (duplicated) {
      return skipWithLatest(`当前周期 ${currentPeriodKey} 已生成过定期再平衡建议`);
    }
  }

  if (!manual && triggerSource === "drift") {
    if (!strategy.drift.enabled) {
      return skipWithLatest("偏移触发未启用，跳过自动生成。");
    }

    if (strategy.drift.checkFrequency === "daily") {
      const todayUtc = now.toISOString().slice(0, 10);
      const alreadyRanToday = recentCycles.some((row) => {
        if (row.triggerSource !== "drift") return false;
        const ts = row.createdAt || row.snapshotAt;
        return typeof ts === "string" && ts.startsWith(todayUtc);
      });
      if (alreadyRanToday) {
        return skipWithLatest("当日偏移检查已完成，跳过重复触发。", { attachLatestCycle: true });
      }
    }

    if (strategy.drift.checkFrequency === "weekly") {
      const latestDriftCycle = recentCycles.find((row) => row.triggerSource === "drift") || null;
      if (latestDriftCycle) {
        const lastMs = Date.parse(latestDriftCycle.createdAt || latestDriftCycle.snapshotAt);
        const nextDueMs = Number.isFinite(lastMs) ? lastMs + (7 * 24 * 60 * 60 * 1000) : NaN;
        if (Number.isFinite(nextDueMs) && nextDueMs > Date.now()) {
          return skipWithLatest("偏移检查频率为每周，当前尚未到下一次检查窗口。");
        }
      }
    }
  }

  const cooldownHours = Math.max(1, systemRow.config.rebalanceStrategy.cooldownHours);
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const cooldownScopedTriggerSource = !manual && (triggerSource === "drift" || triggerSource === "calendar")
    ? triggerSource
    : null;
  const latestAutoComparableCycle = cooldownScopedTriggerSource
    ? (recentCycles.find((row) => row.triggerSource === cooldownScopedTriggerSource) || null)
    : null;
  cooldownReferenceCycle = latestAutoComparableCycle || latestCycle;
  if (cooldownScopedTriggerSource && latestAutoComparableCycle) {
    const lastMs = Date.parse(latestAutoComparableCycle.createdAt || latestAutoComparableCycle.snapshotAt);
    if (Number.isFinite(lastMs) && lastMs + cooldownMs > Date.now()) {
      return skipWithLatest(
        `冷静期生效中，${cooldownHours} 小时内不重复自动触发`,
        { skippedByCooldown: true, cooldownUntil: toIsoByMs(lastMs + cooldownMs), attachLatestCycle: true },
      );
    }
  }

  // ── Step A: 计算 drift draft（纯数学，保持不变）─────────────────────
  const draft = buildCycleDraftFromBootstrap({
    bootstrap,
    triggerReason: input.triggerReason,
  });

  // ── drift 触发的阈值守卫（仅自动触发需要）────────────────────────
  if (!manual && triggerSource === "drift") {
    const thresholdPct = Math.max(0, strategy.drift.thresholdPct * 100);
    if (!(draft.maxAbsDriftPct > thresholdPct)) {
      return skipWithLatest(
        `最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}% 未超过阈值 ${thresholdPct.toFixed(2)}%`,
      );
    }
  }

  // ── Step B: 现金三层分类 ─────────────────────────────────────────
  // P1-2: strategy.cash 已在 RebalanceStrategyConfig 中定义，无需 as any
  const cashConfig = strategy.cash ?? {};
  const cashClassification = classifyCash({
    totalCash: bootstrap.account.cash,
    frozenCash: bootstrap.account.frozenCash,
    totalEquity: bootstrap.account.totalEquity ?? 0,
    assetUniverse: bootstrap.assetUniverse.map((row) => ({
      holdingQty: row.holdingQty,
      valuationBase: row.valuationBase,
      targetWeightPct: row.targetWeightPct,
      holdingTags: row.holdingTags ?? [],
    })),
    config: {
      operationalReservePct: toFinite(cashConfig.operationalReservePct, 0),
      idleThresholdPct: toFinite(cashConfig.idleThresholdPct, 0.1),
      idleCooldownDays: toFinite(cashConfig.idleCooldownDays, 7),
    },
    lastDepositAt: cashConfig.lastDepositAt ?? null,
  });

  // ── 手动触发 + 无 proposals → 组合健康，返回洞察快照 ─────────────
  // 自动触发场景下（calendar/drift/cash_idle）不返回 healthy，因为空 proposals
  // 意味着已被上面的阈值守卫拦截或通过其他逻辑处理。
  if (draft.proposals.length === 0 && manual) {
    const hasTargetAssets = bootstrap.assetUniverse.some((row) => row.watchEnabled && row.targetWeightPct > 0);
    const hasMeaningfulDrift = draft.maxAbsDriftPct > 0.001;
    const totalEquity = Math.max(0, bootstrap.account.totalEquity ?? 0);
    const hasExecutableTargetPricing = bootstrap.assetUniverse.some((row) => (
      row.watchEnabled
      && row.targetWeightPct > 0
      && !row.fxMissing
      && (row.lastPrice > 0 || row.holdingPrice > 0)
    ));

    if (hasMeaningfulDrift && hasTargetAssets && totalEquity <= 0) {
      return skipWithLatest("当前组合尚未建立可计算权益，请先入金或校准持仓后再生成建议。");
    }

    if (hasMeaningfulDrift && hasTargetAssets && !hasExecutableTargetPricing) {
      return skipWithLatest("目标资产缺少可执行价格或汇率，请先刷新行情 / FX 后再生成建议。");
    }

    // 尝试获取信号洞察（非阻断，失败则返回空快照）
    let healthyInsight: PortfolioHealthyInsight = {
      maxDriftPct: draft.maxAbsDriftPct,
      topOpportunities: [],
      llmSummary: null,
      cashIdleWarning: cashClassification.cashIdleWarning,
      cashIdlePct: cashClassification.investableIdlePct,
      generatedAt: new Date().toISOString(),
    };

    try {
      const { request: unifiedRequest } = await buildUnifiedRequestFromStore();
      const hydrated = await hydrateUnifiedRequestWithSignals(unifiedRequest);
      const analysisFocus = normalizeText(input.analysisFocus)
        || strategy.analysisFocus
        || DEFAULT_ANALYSIS_FOCUS_;

      // 简化 LLM 调用：仅获取 summary，不做 per-asset 调整
      const llmResult = await runLlmDecision({
        baseCurrency: bootstrap.baseCurrency,
        totalEquity: bootstrap.account.totalEquity ?? 0,
        cashClassification,
        draftProposals: [],
        fusedOpportunities: hydrated.opportunityPanel.opportunities,
        warnings: bootstrap.warnings,
        analysisFocus,
        marketContext,
      });

      healthyInsight = {
        maxDriftPct: draft.maxAbsDriftPct,
        topOpportunities: hydrated.opportunityPanel.opportunities.slice(0, 5).map((opp) => ({
          symbol: opp.symbol,
          action: opp.action,
          finalScorePct: opp.finalScorePct,
          confidencePct: opp.confidencePct,
        })),
        llmSummary: llmResult.status === "ok" ? llmResult.summary : null,
        cashIdleWarning: cashClassification.cashIdleWarning,
        cashIdlePct: cashClassification.investableIdlePct,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // 洞察加载失败不影响主流程
    }

    void appendTriggerEventSafe({
      triggerSource,
      triggerReason: `组合已接近目标，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      cycleId: null,
      status: "skipped",
      detailsJson: { reason: "portfolio_healthy", maxDriftPct: draft.maxAbsDriftPct },
    });

    return {
      cycle: null,
      created: false,
      skippedByCooldown: false,
      cooldownUntil: null,
      message: `组合已处于目标配置，最大偏移 ${draft.maxAbsDriftPct.toFixed(2)}%，无需调仓`,
      portfolioStatus: "healthy",
      healthyInsight,
      marketRegime: marketContext?.regime || null,
      llmSummary: healthyInsight.llmSummary,
    };
  }

  // ── Step C: 信号富化（四路信号融合）────────────────────────────────
  // 对 draft proposals 中涉及的资产，获取 fused opportunities
  let fusedOpportunities: Awaited<ReturnType<typeof hydrateUnifiedRequestWithSignals>>["opportunityPanel"]["opportunities"] = [];
  try {
    const { request: unifiedRequest } = await buildUnifiedRequestFromStore();
    const hydrated = await hydrateUnifiedRequestWithSignals(unifiedRequest);
    fusedOpportunities = hydrated.opportunityPanel.opportunities;
  } catch {
    // 信号加载失败不阻断再平衡，降级为纯 drift 模式
    bootstrap.warnings.push("信号加载失败，当前再平衡建议仅基于漂移计算，未融合多路信号。");
  }

  // ── Step D: LLM 结构化决策分析 ──────────────────────────────────
  const analysisFocus = normalizeText(input.analysisFocus)
    || strategy.analysisFocus
    || DEFAULT_ANALYSIS_FOCUS_;

  const llmDecision = await runLlmDecision({
    baseCurrency: bootstrap.baseCurrency,
    totalEquity: bootstrap.account.totalEquity ?? 0,
    cashClassification,
    draftProposals: draft.proposals.map((p) => ({
      symbol: p.symbol,
      side: p.side,
      // P0-3: driftPct 需要带符号：BUY=负（低配），SELL=正（超配）
      // suggestedNotional 始终为正值，需根据 side 还原方向
      driftPct: (p.side === "SELL" ? 1 : -1) * p.suggestedNotional / Math.max(1, bootstrap.account.totalEquity ?? 1),
      suggestedNotional: p.suggestedNotional,
    })),
    fusedOpportunities,
    warnings: bootstrap.warnings,
    analysisFocus,
    marketContext,
  });

  // ── Step E: 三层决策融合（drift × signal × LLM）──────────────────
  const assetMetaBySymbol = Object.fromEntries(
    bootstrap.assetUniverse.map((row) => [row.symbol.toUpperCase(), {
      market: row.market,
      assetClass: row.assetClass,
      marketGroup: row.marketGroup,
      instrumentType: row.instrumentType,
      region: row.region,
      exchange: row.exchange,
      holdingTags: row.holdingTags,
      watchTags: row.watchTags,
    }]),
  );
  const fusionResult = fuseDecision({
    draftProposals: draft.proposals,
    fusedOpportunities,
    llmDecision,
    marketContext,
    marketConfig: systemRow.config.dataSources.marketIndicators,
    assetMetaBySymbol,
  });

  // 将融合警告追加到系统 warnings
  const allWarnings = [...bootstrap.warnings, ...fusionResult.fusionWarnings];

  // ── Step F: 风险检查（使用融合后的建议）──────────────────────────
  const riskCheck = buildPreTradeRiskCheckFromBootstrap({
    bootstrap,
    systemConfig: systemRow.config,
    proposals: fusionResult.proposals.filter((p) => p.selected),
  });

  // ── Step G: 创建 Cycle（proposals 已含 decisionContext）──────────
  // 构建 notes：记录 LLM 状态和融合摘要，供审计追踪
  const cycleNotes = [
    `LLM状态: ${llmDecision.status}`,
    marketContext ? `规则市场环境: ${marketRegimeLabelZh(marketContext.regime)} / 风险分 ${marketContext.riskOffScorePct.toFixed(1)}` : null,
    llmDecision.status === "ok" ? `AI 市场环境: ${marketRegimeLabelZh(llmDecision.marketRegime)}` : null,
    fusionResult.marketRegime ? `最终生效市场环境: ${marketRegimeLabelZh(fusionResult.marketRegime)}` : null,
    marketContext ? `关键市场指标摘要: ${buildMarketFacts(marketContext).slice(0, 3).join(" | ")}` : null,
    llmDecision.status === "ok" ? `AI总结: ${llmDecision.summary.slice(0, 80)}` : null,
    fusionResult.fusionWarnings.length > 0
      ? `融合警告: ${fusionResult.fusionWarnings.slice(0, 2).join(" | ")}`
      : null,
    cashClassification.cashIdleWarning
      ? `现金提示: 闲置资金 ${(cashClassification.investableIdlePct * 100).toFixed(1)}%（已${cashClassification.cashIdleDays}天）`
      : null,
  ].filter(Boolean).join("\n");

  const created = await createDaaRebalanceCycle({
    triggerSource,
    triggerReason: draft.triggerReason,
    snapshotAt: new Date().toISOString(),
    equitySnapshot: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
    driftSnapshot: draft.driftSnapshot,
    proposals: fusionResult.proposals,
    riskCheck,
    notes: cycleNotes || null,
    marketContext,
  });

  await appendTriggerEventSafe({
    triggerSource,
    triggerReason: draft.triggerReason,
    cycleId: created.cycleId,
    status: "accepted",
    detailsJson: {
      proposalCount: fusionResult.proposals.length,
      riskOverallStatus: riskCheck.overallStatus,
      llmStatus: llmDecision.status,
      ruleBasedMarketRegime: marketContext?.regime || null,
      marketRegime: fusionResult.marketRegime,
      fusionWarningCount: fusionResult.fusionWarnings.length,
      cashIdleWarning: cashClassification.cashIdleWarning,
    },
  });

  return {
    cycle: mapStoreCycleToView(created),
    created: true,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: `已生成再平衡周期 ${created.cycleId}`,
    portfolioStatus: "needs_rebalance",
    marketRegime: fusionResult.marketRegime || marketContext?.regime || null,
    llmSummary: llmDecision.status === "ok" ? llmDecision.summary : null,
  };
}
export async function updateWorkbenchRebalanceCycle(
  cycleId: string,
  input: UpdateRebalanceCycleInput,
): Promise<RebalanceCycle> {
  const current = await getDaaRebalanceCycle(cycleId);
  if (!current) throw new Error(`cycle not found: ${cycleId}`);
  assertCycleMutable(current);

  let proposals = current.proposals;
  let nextRiskCheck = current.riskCheck;
  const hasAssetSideKeys = Array.isArray(input.selectedAssetSideKeys);
  const hasSymbols = Array.isArray(input.selectedSymbols);
  if (hasAssetSideKeys || hasSymbols) {
    if (hasAssetSideKeys) {
      // 精确匹配：format "${assetKey}::${side}"，BUY/SELL 互不干扰
      const selectedSet = new Set(
        (input.selectedAssetSideKeys ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean),
      );
      proposals = proposals.map((row) => ({
        ...row,
        selected: selectedSet.has(`${row.assetKey.toUpperCase()}::${row.side.toUpperCase()}`),
      }));
    } else {
      // 兼容旧路径：按 symbol 匹配
      const selectedSet = new Set(
        (input.selectedSymbols ?? []).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean),
      );
      proposals = proposals.map((row) => ({
        ...row,
        selected: selectedSet.has(row.symbol.toUpperCase()),
      }));
    }

    const [bootstrap, systemRow] = await Promise.all([
      buildWorkbenchBootstrap({ syncPrices: false }),
      getDaaSystemConfig(),
    ]);
    nextRiskCheck = buildPreTradeRiskCheckFromBootstrap({
      bootstrap,
      systemConfig: systemRow.config,
      proposals: proposals.filter((row) => row.selected),
    });
  }

  const patchInput: Parameters<typeof patchDaaRebalanceCycle>[0] = {
    cycleId,
    proposals,
    riskCheck: nextRiskCheck,
    notes: input.notes === undefined ? current.notes : input.notes,
  };
  if (input.status === "reviewing") {
    patchInput.status = "reviewing";
  }
  if (input.cancel) {
    patchInput.status = "cancelled";
    patchInput.cancelledAt = new Date().toISOString();
    patchInput.cancelReason = normalizeText(input.cancel.reason) || "用户取消";
  }

  const patched = await patchDaaRebalanceCycle(patchInput);
  const mapped = mapStoreCycleToView(patched);
  if (!mapped) throw new Error("cycle update failed");
  return mapped;
}

export async function executeWorkbenchRebalanceCycle(input: {
  cycleId: string;
  executeMode: "selected" | "all";
}): Promise<ExecuteRebalanceCycleResult> {
  const cycle = await getDaaRebalanceCycle(input.cycleId);
  if (!cycle) throw new Error(`cycle not found: ${input.cycleId}`);
  assertCycleExecutable(cycle, "execute");

  const toExecute = cycle.proposals.filter((row) => input.executeMode === "all" || row.selected);
  if (!toExecute.length) {
    const reviewed = await patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      status: "reviewing",
    });
    return {
      cycle: mapStoreCycleToView(reviewed)!,
      logs: await listDaaTradeTickets({ limit: 200 }),
    };
  }

  const [preTradeRiskCheck, systemRow, beforeBootstrap] = await Promise.all([
    validateExecutionRisk({
      cycleId: input.cycleId,
      selectedSymbols: toExecute.map((row) => row.symbol),
    }),
    getDaaSystemConfig(),
    buildWorkbenchBootstrap({ syncPrices: false }),
  ]);
  const enforceOnExecution = systemRow.config.strategy.risk.enforceOnExecution !== false;
  const feeRateBps = getStrategyExecutionConfig(systemRow.config).feeRateBps;
  const feeRate = feeRateBps / 10000;
  if (enforceOnExecution && preTradeRiskCheck.overallStatus === "block") {
    await patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      status: "reviewing",
      riskCheck: preTradeRiskCheck,
    });
    const blockedItem = preTradeRiskCheck.items.find((item) => item.status === "block");
    throw new Error(`RISK_BLOCKED:${JSON.stringify({
      code: "RISK_BLOCKED",
      rule: blockedItem?.rule || "unknown",
      message: blockedItem?.message || "执行前风控阻断",
      current: blockedItem?.current ?? null,
      limit: blockedItem?.limit ?? null,
    })}`);
  }

  await patchDaaRebalanceCycle({
    cycleId: input.cycleId,
    status: "executing",
    riskCheck: preTradeRiskCheck,
  });

  const createdTicketIds: string[] = [];
  for (const row of toExecute) {
    if (!(row.price > 0) || !(row.suggestedQty > 0)) continue;
    const parsed = parseDaaAssetKey(row.assetKey);
    const fee = Math.max(0, row.suggestedQty * row.price * feeRate);
    const created = await createDaaTradeTicket({
      source: "decision",
      cycleId: input.cycleId,
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: parsed?.market || "US",
      instrumentCurrency: normalizeDaaCurrencyCode(row.currency, "USD"),
      side: row.side,
      qty: row.suggestedQty,
      price: row.price,
      fee,
      pricingMode: "market",
      priceSource: "rebalance_cycle",
      decisionRefId: input.cycleId,
      reasonText: row.reason,
      reasonTags: ["rebalance_cycle"],
      createdBy: "workbench.rebalance",
    });
    createdTicketIds.push(created.ticketId);
  }

  const execution = createdTicketIds.length
    ? await executeDaaTradeTickets({ ticketIds: createdTicketIds })
    : null;

  const executedCount = execution
    ? execution.results.filter((item) => item.status === "executed").length
    : 0;
  const failedCount = execution
    ? execution.results.filter((item) => item.status !== "executed").length
    : 0;
  const totalNotional = toExecute.reduce((sum, row) => sum + row.suggestedNotional, 0);
  const newMaxDriftPct = cycle.driftSnapshot.reduce((max, row) => Math.max(max, Math.abs(row.driftPct * 100)), 0);

  const completed = await patchDaaRebalanceCycle({
    cycleId: input.cycleId,
    status: "completed",
    executedAt: new Date().toISOString(),
    executedOrders: createdTicketIds,
    executionSummary: {
      ordersExecuted: executedCount,
      ordersFailed: failedCount,
      totalNotional,
      newMaxDriftPct,
    },
  });

  const [logs, afterBootstrap] = await Promise.all([
    listDaaTradeTickets({ limit: 300 }),
    buildWorkbenchBootstrap({ syncPrices: false }),
  ]);

  try {
    const beforeSnapshot = toCycleReportSnapshot(beforeBootstrap);
    const afterSnapshot = toCycleReportSnapshot(afterBootstrap);
    const cycleLogs = logs.filter((row) => createdTicketIds.includes(row.ticketId));
    const feeTotal = cycleLogs
      .filter((row) => row.status === "executed")
      .reduce((sum, row) => sum + Math.max(0, row.fee), 0);

    const beforeBySymbol = new Map(beforeBootstrap.assetUniverse.map((row) => [row.symbol.toUpperCase(), row]));
    const realizedBySymbol = new Map<string, number>();
    for (const row of cycleLogs) {
      if (row.status !== "executed" || row.side !== "SELL") continue;
      const before = beforeBySymbol.get(row.symbol.toUpperCase());
      if (!before) continue;
      const costPerUnit = calcHoldingCostPerUnit(before);
      const fx = before.fxRateToBase && before.fxRateToBase > 0 ? before.fxRateToBase : 1;
      const pnl = (row.price - costPerUnit) * row.qty * fx;
      realizedBySymbol.set(row.symbol, (realizedBySymbol.get(row.symbol) || 0) + pnl);
    }
    let unrealizedPnl = 0;
    for (const row of afterBootstrap.assetUniverse) {
      if (!(row.holdingQty > 0)) continue;
      const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
      const costPerUnit = calcHoldingCostPerUnit(row);
      const fx = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : 1;
      unrealizedPnl += (px - costPerUnit) * row.holdingQty * fx;
    }
    const topContributors = [...realizedBySymbol.entries()]
      .map(([symbol, pnl]) => ({ symbol, pnl, side: "SELL" as const }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5);
    const realizedPnl = [...realizedBySymbol.values()].reduce((sum, value) => sum + value, 0);

    await upsertDaaCycleReport({
      cycleId: input.cycleId,
      beforeSnapshot,
      afterSnapshot,
      executionStats: {
        ordersExecuted: executedCount,
        ordersFailed: failedCount,
        totalNotional,
        newMaxDriftPct,
        feeTotal,
      },
      pnlAttribution: {
        realizedPnl,
        unrealizedPnl,
        feeTotal,
        fxImpact: 0,
        topContributors,
      },
      riskDelta: {
        maxDrawdownBefore: beforeSnapshot.maxDrawdownPct,
        maxDrawdownAfter: afterSnapshot.maxDrawdownPct,
        hhiBefore: beforeSnapshot.hhiPct,
        hhiAfter: afterSnapshot.hhiPct,
        maxWeightBefore: beforeSnapshot.maxWeightPct,
        maxWeightAfter: afterSnapshot.maxWeightPct,
        maxDriftBefore: beforeSnapshot.maxDriftPct,
        maxDriftAfter: afterSnapshot.maxDriftPct,
      },
    });
  } catch {
    // 复盘报告生成失败不阻塞交易主流程
  }

  return {
    cycle: mapStoreCycleToView(completed)!,
    logs: logs.filter((row) => row.status !== "ready").slice(0, 200),
  };
}


