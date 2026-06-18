import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeText, toFinite, toPositive } from "@/src/daa/utils/normalize";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import type {
  DaaAssetBudgetOverlayKey,
  DaaMarketContext,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import { marketRegimeLabelZh } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { collectRiskTriggerAssets, resolvePositionDrawdownPct } from "@/src/daa/modules/portfolio-state/positionPnl";
import {
  getDaaCycleReport,
  getDaaHumanIngestState,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { computeCorrelationMatrix } from "./correlationService";
import { normalizeOrderSizing } from "./orderSizing";
import type {
  PreTradeRiskCheck,
  PreTradeRiskCheckItem,
  PreTradeRiskRule,
  ProposalDecisionContext,
  RebalanceProposal,
} from "@/src/daa/modules/rebalance/rebalanceTypes";
import type {
  HfSignalSummary,
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchRebalanceCycleReport,
} from "./workbenchTypes";

function toPct(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num))
        return 0;
    return num;
}

function buildHfSignalSummary(input: {
    symbol: string;
    scorePct: number;
    convictionPct: number;
    thesisDriftPct: number;
    fundDetails: HfSignalSummary["funds"];
}): HfSignalSummary {
    const score = toPct(input.scorePct);
    const conviction = toPct(input.convictionPct);
    const thesisDrift = toPct(input.thesisDriftPct);
    let level: HfSignalSummary["level"] = "none";
    let icon: HfSignalSummary["icon"] = "⚪";
    let label = "无信号";
    if (score > 0 || conviction > 0 || thesisDrift > 0) {
        if (score > 60 && conviction > 50) {
            level = "bullish";
            icon = "🟢";
            label = "偏多共识";
        }
        else if (score < 40 || thesisDrift > 12) {
            level = "bearish";
            icon = "🔴";
            label = "偏空/减持";
        }
        else {
            level = "neutral";
            icon = "🟡";
            label = "中性观察";
        }
    }
    const netChange = input.fundDetails.reduce((sum, row) => sum + row.changePct, 0);
    const trend: HfSignalSummary["trend"] = level === "none"
        ? "none"
        : (netChange > 0.1 ? "adding" : (netChange < -0.1 ? "trimming" : "neutral"));
    return {
        level,
        icon,
        label,
        aggregatedScorePct: score,
        convictionPct: conviction,
        thesisDriftPct: thesisDrift,
        fundCount: input.fundDetails.length,
        trend,
        funds: input.fundDetails,
    };
}

async function buildHfSignalMap(): Promise<Map<string, HfSignalSummary>> {
    const state = await getDaaHumanIngestState();
    const map = new Map<string, HfSignalSummary>();
    if (!state?.latestBatch)
        return map;
    const latestBatch = state.latestBatch && typeof state.latestBatch === "object"
        ? state.latestBatch as Record<string, unknown>
        : {};
    const signals = Array.isArray(latestBatch.signals) ? latestBatch.signals : [];
    const holdingsBySymbol = new Map<string, HfSignalSummary["funds"]>();
    for (const rowRaw of Array.isArray(state.latestHoldings) ? state.latestHoldings : []) {
        const row = rowRaw && typeof rowRaw === "object" ? rowRaw as Record<string, unknown> : {};
        const symbol = normalizeText(row.symbol).toUpperCase();
        if (!symbol)
            continue;
        const list = holdingsBySymbol.get(symbol) || [];
        list.push({
            fundCode: normalizeText(row.fundCode || row.actorId || ""),
            fundName: normalizeText(row.fundName || row.actorName || ""),
            weightPct: toPct(row.weightPct || row.weight || 0),
            changePct: toPct(row.changePct || row.weightDeltaPct || 0),
        });
        holdingsBySymbol.set(symbol, list);
    }
    for (const itemRaw of signals) {
        const item = itemRaw && typeof itemRaw === "object" ? itemRaw as Record<string, unknown> : {};
        const symbol = normalizeText(item.symbol).toUpperCase();
        if (!symbol)
            continue;
        const funds = (holdingsBySymbol.get(symbol) || [])
            .filter((row) => row.fundCode || row.fundName)
            .slice(0, 6);
        map.set(symbol, buildHfSignalSummary({
            symbol,
            scorePct: Number(item.aggregatedScorePct || 0),
            convictionPct: Number(item.convictionPct || 0),
            thesisDriftPct: Number(item.thesisDriftPct || 0),
            fundDetails: funds,
        }));
    }
    return map;
}

function computeHhiPct(weightsPct: number[]): number {
    if (!weightsPct.length)
        return 0;
    return weightsPct.reduce((sum, weight) => sum + ((weight / 100) ** 2), 0) * 100;
}

type ProjectedPositionRiskRow = {
    assetKey: string;
    symbol: string;
    currentValue: number;
    nextValue: number;
    currentWeightPct: number;
    projectedWeightPct: number;
    targetWeightPct: number;
    netDelta: number;
    touched: boolean;
};

function buildMaxPositionRiskItem(input: {
    rows: ProjectedPositionRiskRow[];
    maxPositionLimitPct: number;
    preferTouched: boolean;
}): PreTradeRiskCheckItem {
    const liveRows = input.rows.filter((row) => row.nextValue > 0);
    const touchedRows = liveRows.filter((row) => row.touched);
    const candidates = input.preferTouched && touchedRows.length > 0 ? touchedRows : liveRows;
    const fallback: ProjectedPositionRiskRow = {
        assetKey: "",
        symbol: "组合",
        currentValue: 0,
        nextValue: 0,
        currentWeightPct: 0,
        projectedWeightPct: 0,
        targetWeightPct: 0,
        netDelta: 0,
        touched: false,
    };
    const assessed = candidates.map((row) => {
        const currentDistance = Math.abs(row.currentWeightPct - row.targetWeightPct);
        const projectedDistance = Math.abs(row.projectedWeightPct - row.targetWeightPct);
        const isReducingTowardTarget = row.netDelta < 0 && projectedDistance < currentDistance;
        const exceeds = row.projectedWeightPct > input.maxPositionLimitPct;
        const status: PreTradeRiskCheckItem["status"] = exceeds
            ? (isReducingTowardTarget ? "warn" : "block")
            : "pass";
        const message = exceeds
            ? (isReducingTowardTarget
                ? `${row.symbol || "标的"} 交易后仓位 ${row.projectedWeightPct.toFixed(2)}% 仍超过上限 ${input.maxPositionLimitPct.toFixed(2)}%，但本次交易正向目标 ${row.targetWeightPct.toFixed(2)}% 收敛，按提醒放行`
                : `${row.symbol || "标的"} 交易后仓位 ${row.projectedWeightPct.toFixed(2)}% 超过上限 ${input.maxPositionLimitPct.toFixed(2)}%`)
            : `${row.symbol || "标的"} 交易后仓位 ${row.projectedWeightPct.toFixed(2)}%`;
        return {
            row,
            item: {
                rule: "max_position" as const,
                status,
                current: row.projectedWeightPct,
                limit: input.maxPositionLimitPct,
                message,
            },
        };
    });
    const severity = { block: 2, warn: 1, pass: 0 } satisfies Record<PreTradeRiskCheckItem["status"], number>;
    const best = assessed.sort((a, b) => {
        const severityDelta = severity[b.item.status] - severity[a.item.status];
        if (severityDelta !== 0)
            return severityDelta;
        return b.row.projectedWeightPct - a.row.projectedWeightPct;
    })[0];
    return best?.item ?? {
        rule: "max_position",
        status: "pass",
        current: fallback.projectedWeightPct,
        limit: input.maxPositionLimitPct,
        message: `最大单一持仓交易后仓位 ${fallback.projectedWeightPct.toFixed(2)}%`,
    };
}

function buildStopLossRiskItem(input: {
    assetUniverse: WorkbenchBootstrap["assetUniverse"];
    stopLossPct: number;
}): PreTradeRiskCheckItem {
    const worstDrawdown = input.assetUniverse.reduce((worst, row) => {
        const drawdownPct = resolvePositionDrawdownPct(row);
        return Math.max(worst, drawdownPct ?? 0);
    }, 0);
    const breached = input.stopLossPct > 0 && worstDrawdown >= input.stopLossPct;
    return {
        rule: "stop_loss_breach",
        status: breached ? "warn" : "pass",
        current: worstDrawdown,
        limit: input.stopLossPct,
        message: breached
            ? `存在持仓浮亏 ${worstDrawdown.toFixed(2)}%，达到止损线 ${input.stopLossPct.toFixed(2)}%`
            : `持仓止损检查通过（最大浮亏 ${worstDrawdown.toFixed(2)}%）`,
    };
}

function buildPreTradeRiskCheck(input: {
    assetUniverse: WorkbenchBootstrap["assetUniverse"];
    proposals: RebalanceProposal[];
    totalEquity: number;
    availableCash?: number;
    constraints: {
        maxPositionPct: number;
        maxOrderPctOfNav: number;
    };
    risk: {
        perAssetStopLossPct: number;
        maxConcentrationPct: number;
    };
}): PreTradeRiskCheck {
    const items: PreTradeRiskCheckItem[] = [];
    const maxPositionLimitPct = Math.max(0, input.constraints.maxPositionPct) * 100;
    const maxOrderPctOfNav = Math.max(0, input.constraints.maxOrderPctOfNav) * 100;
    const maxConcentrationPct = Math.max(0, input.risk.maxConcentrationPct) * 100;
    const stopLossPct = Math.max(0, input.risk.perAssetStopLossPct) * 100;
    const currentValueByAssetKey = new Map<string, number>();
    const projectedValueByAssetKey = new Map<string, number>();
    const symbolByAssetKey = new Map<string, string>();
    const targetPctByAssetKey = new Map<string, number>();
    const netDeltaByAssetKey = new Map<string, number>();
    for (const row of input.assetUniverse) {
        const currentValue = Math.max(0, toFinite(row.valuationBase, 0));
        currentValueByAssetKey.set(row.assetKey, currentValue);
        projectedValueByAssetKey.set(row.assetKey, currentValue);
        symbolByAssetKey.set(row.assetKey, row.symbol);
        targetPctByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.targetWeightPct, 0)));
    }
    for (const proposal of input.proposals) {
        const currentValue = projectedValueByAssetKey.get(proposal.assetKey) || 0;
        const proposalNotional = Math.max(0, toFinite(proposal.suggestedNotional, 0));
        const delta = proposal.side === "BUY" ? proposalNotional : -proposalNotional;
        projectedValueByAssetKey.set(proposal.assetKey, Math.max(0, currentValue + delta));
        netDeltaByAssetKey.set(proposal.assetKey, (netDeltaByAssetKey.get(proposal.assetKey) || 0) + delta);
        if (!symbolByAssetKey.has(proposal.assetKey)) {
            symbolByAssetKey.set(proposal.assetKey, proposal.symbol);
        }
    }
    const projectedAssetRows = Array.from(projectedValueByAssetKey.entries())
        .map(([assetKey, nextValue]) => ({
        assetKey,
        symbol: symbolByAssetKey.get(assetKey) || assetKey,
        currentValue: Math.max(0, currentValueByAssetKey.get(assetKey) || 0),
        nextValue: Math.max(0, nextValue),
        targetWeightPct: targetPctByAssetKey.get(assetKey) || 0,
        netDelta: netDeltaByAssetKey.get(assetKey) || 0,
        touched: netDeltaByAssetKey.has(assetKey),
    }))
        .filter((row) => row.nextValue > 0);
    const totalProjectedAssetValue = projectedAssetRows.reduce((sum, row) => sum + row.nextValue, 0);
    const totalNotional = input.proposals.reduce((sum, row) => sum + Math.max(0, toFinite(row.suggestedNotional, 0)), 0);
    const riskNavBase = input.totalEquity > 0
        ? input.totalEquity
        : Math.max(totalProjectedAssetValue, totalNotional, 1e-9);
    const projectedWeights: ProjectedPositionRiskRow[] = projectedAssetRows.map((row) => ({
        ...row,
        currentWeightPct: riskNavBase > 0 ? (row.currentValue / riskNavBase) * 100 : 0,
        projectedWeightPct: riskNavBase > 0 ? (row.nextValue / riskNavBase) * 100 : 0,
    }));
    items.push(buildMaxPositionRiskItem({
        rows: projectedWeights,
        maxPositionLimitPct,
        preferTouched: input.proposals.length > 0,
    }));
    const totalWeightPct = projectedWeights.reduce((sum, row) => sum + row.projectedWeightPct, 0);
    items.push({
        rule: "total_weight",
        status: totalWeightPct > 100.0001 ? "block" : "pass",
        current: totalWeightPct,
        limit: 100,
        message: totalWeightPct > 100.0001
            ? `交易后已投资仓位 ${totalWeightPct.toFixed(2)}% 超过 100%`
            : `交易后已投资仓位 ${totalWeightPct.toFixed(2)}%`,
    });
    const orderPctOfNav = riskNavBase > 0 ? (totalNotional / riskNavBase) * 100 : 0;
    items.push({
        rule: "max_order_pct",
        status: orderPctOfNav > maxOrderPctOfNav ? "warn" : "pass",
        current: orderPctOfNav,
        limit: maxOrderPctOfNav,
        message: orderPctOfNav > maxOrderPctOfNav
            ? `单日交易占比 ${orderPctOfNav.toFixed(2)}% 超过阈值 ${maxOrderPctOfNav.toFixed(2)}%`
            : `单日交易占比 ${orderPctOfNav.toFixed(2)}%`,
    });
    const hhi = computeHhiPct(projectedWeights.map((row) => row.projectedWeightPct));
    items.push({
        rule: "concentration",
        status: hhi > maxConcentrationPct ? "warn" : "pass",
        current: hhi,
        limit: maxConcentrationPct,
        message: hhi > maxConcentrationPct
            ? `交易后组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
            : `交易后组合集中度(HHI) ${hhi.toFixed(2)}`,
    });
    items.push(buildStopLossRiskItem({
        assetUniverse: input.assetUniverse,
        stopLossPct,
    }));
    // 现金充足性检查：BUY 提案总金额 vs 可用现金
    const totalBuyNotional = input.proposals
        .filter((p) => p.side === "BUY" && p.selected)
        .reduce((sum, p) => sum + p.suggestedNotional, 0);
    const availCash = Math.max(0, toFinite(input.availableCash, 0));
    if (availCash > 0 || totalBuyNotional > 0) {
        items.push({
            rule: "cash_sufficiency",
            status: totalBuyNotional > availCash ? "block" : "pass",
            current: totalBuyNotional,
            limit: availCash,
            message: totalBuyNotional > availCash
                ? `买入总额 $${totalBuyNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })} 超过可用现金 $${availCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `买入总额在可用现金范围内`,
        });
    }
    const hasBlock = items.some((item) => item.status === "block");
    const hasWarn = items.some((item) => item.status === "warn");
    return {
        overallStatus: hasBlock ? "block" : (hasWarn ? "warn" : "pass"),
        items,
    };
}

function buildPreTradeRiskCheckFromBootstrap(input: {
    bootstrap: WorkbenchBootstrap;
    systemConfig: Awaited<ReturnType<typeof getDaaSystemConfig>>["config"];
    proposals: RebalanceProposal[];
}): PreTradeRiskCheck {
    return buildPreTradeRiskCheck({
        assetUniverse: input.bootstrap.assetUniverse,
        proposals: input.proposals,
        totalEquity: Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0)),
        availableCash: Math.max(0, toFinite(input.bootstrap.account.investableCash, 0)),
        constraints: {
            maxPositionPct: input.systemConfig.strategy.constraints.maxPositionPct,
            maxOrderPctOfNav: input.systemConfig.strategy.constraints.maxOrderPctOfNav,
        },
        risk: {
            perAssetStopLossPct: input.systemConfig.strategy.risk.perAssetStopLossPct,
            maxConcentrationPct: input.systemConfig.strategy.risk.maxConcentrationPct,
        },
    });
}

function buildManualPreTradeRiskCheck(input: {
    assetUniverse: WorkbenchBootstrap["assetUniverse"];
    proposal: RebalanceProposal;
    totalEquity: number;
    constraints: {
        maxPositionPct: number;
        maxOrderPctOfNav: number;
    };
    risk: {
        perAssetStopLossPct: number;
        maxConcentrationPct: number;
    };
}): PreTradeRiskCheck {
    const items: PreTradeRiskCheckItem[] = [];
    const currentTotalEquity = Math.max(0, input.totalEquity);
    const maxPositionLimitPct = Math.max(0, input.constraints.maxPositionPct) * 100;
    const maxOrderPctOfNav = Math.max(0, input.constraints.maxOrderPctOfNav) * 100;
    const maxConcentrationPct = Math.max(0, input.risk.maxConcentrationPct) * 100;
    const stopLossPct = Math.max(0, input.risk.perAssetStopLossPct) * 100;
    const currentValueByAssetKey = new Map<string, number>();
    const targetPctByAssetKey = new Map<string, number>();
    for (const row of input.assetUniverse) {
        currentValueByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.valuationBase, 0)));
        targetPctByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.targetWeightPct, 0)));
    }
    const currentProposalValue = currentValueByAssetKey.get(input.proposal.assetKey) || 0;
    const proposalNotional = Math.max(0, toFinite(input.proposal.suggestedNotional, 0));
    const proposalDelta = input.proposal.side === "BUY"
        ? proposalNotional
        : -proposalNotional;
    const nextProposalValue = Math.max(0, currentProposalValue + proposalDelta);
    const projectedAssetTotal = input.assetUniverse.reduce((sum, row) => {
        const currentValue = currentValueByAssetKey.get(row.assetKey) || 0;
        const nextValue = row.assetKey === input.proposal.assetKey ? nextProposalValue : currentValue;
        return sum + Math.max(0, nextValue);
    }, 0);
    const riskNavBase = currentTotalEquity > 0
        ? currentTotalEquity
        : Math.max(projectedAssetTotal, nextProposalValue, proposalNotional, 1e-9);
    const projectedWeights = input.assetUniverse
        .map((row) => {
        const currentValue = currentValueByAssetKey.get(row.assetKey) || 0;
        const nextValue = row.assetKey === input.proposal.assetKey ? nextProposalValue : currentValue;
        return {
            assetKey: row.assetKey,
            symbol: row.symbol,
            currentValue,
            nextValue,
            currentWeightPct: riskNavBase > 0 ? (currentValue / riskNavBase) * 100 : 0,
            projectedWeightPct: riskNavBase > 0 ? (nextValue / riskNavBase) * 100 : 0,
            targetWeightPct: targetPctByAssetKey.get(row.assetKey) || 0,
            netDelta: row.assetKey === input.proposal.assetKey ? proposalDelta : 0,
            touched: row.assetKey === input.proposal.assetKey,
        };
    })
        .filter((row) => row.nextValue > 0);
    if (!projectedWeights.some((row) => row.assetKey === input.proposal.assetKey)) {
        projectedWeights.push({
            assetKey: input.proposal.assetKey,
            symbol: input.proposal.symbol,
            currentValue: currentProposalValue,
            nextValue: nextProposalValue,
            currentWeightPct: riskNavBase > 0 ? (currentProposalValue / riskNavBase) * 100 : 0,
            projectedWeightPct: riskNavBase > 0 ? (nextProposalValue / riskNavBase) * 100 : 0,
            targetWeightPct: targetPctByAssetKey.get(input.proposal.assetKey) || 0,
            netDelta: proposalDelta,
            touched: true,
        });
    }
    items.push(buildMaxPositionRiskItem({
        rows: projectedWeights,
        maxPositionLimitPct,
        preferTouched: true,
    }));
    const investedWeightPct = projectedWeights.reduce((sum, row) => sum + row.projectedWeightPct, 0);
    items.push({
        rule: "total_weight",
        status: investedWeightPct > 100.0001 ? "block" : "pass",
        current: investedWeightPct,
        limit: 100,
        message: investedWeightPct > 100.0001
            ? `交易后持仓权重总和 ${investedWeightPct.toFixed(2)}% 超过 100%`
            : `交易后已投资仓位 ${investedWeightPct.toFixed(2)}%`,
    });
    const orderPctOfNav = riskNavBase > 0 ? (proposalNotional / riskNavBase) * 100 : 0;
    items.push({
        rule: "max_order_pct",
        status: orderPctOfNav > maxOrderPctOfNav ? "warn" : "pass",
        current: orderPctOfNav,
        limit: maxOrderPctOfNav,
        message: orderPctOfNav > maxOrderPctOfNav
            ? `单日交易占比 ${orderPctOfNav.toFixed(2)}% 超过阈值 ${maxOrderPctOfNav.toFixed(2)}%`
            : `单日交易占比 ${orderPctOfNav.toFixed(2)}%`,
    });
    const hhi = computeHhiPct(projectedWeights.map((row) => row.projectedWeightPct));
    items.push({
        rule: "concentration",
        status: hhi > maxConcentrationPct ? "warn" : "pass",
        current: hhi,
        limit: maxConcentrationPct,
        message: hhi > maxConcentrationPct
            ? `交易后组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
            : `交易后组合集中度(HHI) ${hhi.toFixed(2)}`,
    });
    items.push(buildStopLossRiskItem({
        assetUniverse: input.assetUniverse,
        stopLossPct,
    }));
    const hasBlock = items.some((item) => item.status === "block");
    const hasWarn = items.some((item) => item.status === "warn");
    return {
        overallStatus: hasBlock ? "block" : (hasWarn ? "warn" : "pass"),
        items,
    };
}

function mapStoreCycleToView(cycle: DaaStoreRebalanceCycle | null): RebalanceCycle | null {
    if (!cycle)
        return null;
    return {
        cycleId: cycle.cycleId,
        status: cycle.status,
        triggerSource: cycle.triggerSource,
        triggerReason: cycle.triggerReason,
        snapshotAt: cycle.snapshotAt,
        equitySnapshot: cycle.equitySnapshot,
        driftSnapshot: cycle.driftSnapshot,
        proposals: cycle.proposals,
        riskCheck: cycle.riskCheck,
        executionStartedAt: cycle.executionStartedAt,
        executedAt: cycle.executedAt,
        executedOrders: cycle.executedOrders,
        executionSummary: cycle.executionSummary,
        cancelledAt: cycle.cancelledAt,
        cancelReason: cycle.cancelReason,
        notes: cycle.notes,
        marketContext: cycle.marketContext || null,
        policyDecisionId: cycle.policyDecisionId ?? null,
        intentIds: cycle.intentIds ?? [],
        signalIds: cycle.signalIds ?? [],
        policySnapshot: cycle.policySnapshot ?? null,
        proposalPlanId: cycle.proposalPlanId ?? null,
        agentDecisionSnapshot: cycle.agentDecisionSnapshot ? {
            status: String((cycle.agentDecisionSnapshot as Record<string, unknown>).status ?? ""),
            marketRegime: String((cycle.agentDecisionSnapshot as Record<string, unknown>).marketRegime ?? ""),
            overallConfidence: Number((cycle.agentDecisionSnapshot as Record<string, unknown>).overallConfidence) || 0,
            summary: String((cycle.agentDecisionSnapshot as Record<string, unknown>).summary ?? ""),
            keyRisks: Array.isArray((cycle.agentDecisionSnapshot as Record<string, unknown>).keyRisks)
                ? ((cycle.agentDecisionSnapshot as Record<string, unknown>).keyRisks as string[])
                : [],
            keyOpportunities: Array.isArray((cycle.agentDecisionSnapshot as Record<string, unknown>).keyOpportunities)
                ? ((cycle.agentDecisionSnapshot as Record<string, unknown>).keyOpportunities as string[])
                : [],
            cashAdvice: String((cycle.agentDecisionSnapshot as Record<string, unknown>).cashAdvice ?? ""),
            cashRationale: String((cycle.agentDecisionSnapshot as Record<string, unknown>).cashRationale ?? ""),
            provider: String((cycle.agentDecisionSnapshot as Record<string, unknown>).provider ?? ""),
            model: String((cycle.agentDecisionSnapshot as Record<string, unknown>).model ?? ""),
            latencyMs: Number((cycle.agentDecisionSnapshot as Record<string, unknown>).latencyMs) || 0,
            generatedAt: String((cycle.agentDecisionSnapshot as Record<string, unknown>).generatedAt ?? ""),
            reasoning: (cycle.agentDecisionSnapshot as Record<string, unknown>).reasoning
                ? String((cycle.agentDecisionSnapshot as Record<string, unknown>).reasoning)
                : undefined,
        } : null,
        createdAt: cycle.createdAt,
    };
}

function buildMarketFacts(marketContext: DaaMarketContext | null | undefined): string[] {
    if (!marketContext)
        return [];
    const scopeFacts = marketContext.scopes.slice(0, 4).map((scope) => {
        const lead = scope.indicators[0] || null;
        const value = lead?.rawValue == null ? "N/A" : `${lead.rawValue}${lead.unit || ""}`;
        const percentile = lead?.percentile252 == null ? "N/A" : `${lead.percentile252.toFixed(1)}%`;
        return `${scope.label} ${marketRegimeLabelZh(scope.regime)} / 压力 ${Math.round(scope.riskOffScorePct)}/100 / ${lead?.label || "指标"} ${value} / 近一年位置 ${percentile}`;
    });
    const assetBudgetFacts = (marketContext.assetBudgets || []).slice(0, 4).map((budget) => (
        `${budget.label} 预算系数 ${Math.round(budget.budgetScale * 100)}% / ${budget.reasons[0] || "暂无具体原因"}`
    ));
    if (!marketContext.macroPolicy) return [...scopeFacts, ...assetBudgetFacts];
    return [
        ...scopeFacts,
        `宏观政策 ${marketContext.macroPolicy.label} / 压力 ${marketContext.macroPolicy.pressurePct.toFixed(0)}/100 / ${marketContext.macroPolicy.reasons[0] || "暂无具体原因"}`,
        ...assetBudgetFacts,
    ];
}

const SHORT_BOND_CASH_SYMBOLS = new Set(["SGOV", "BIL", "SHV", "MINT", "JPST", "CASH", "USFR", "TFLO", "BILS", "GBIL"]);
const GOLD_COMMODITY_SYMBOLS = new Set(["GLD", "IAU", "SLV", "GC=F", "SI=F", "DBC", "GOLD", "XAUUSD", "XAGUSD"]);

function normalizeUpper(value: unknown): string {
    return normalizeText(value).toUpperCase();
}

function uniqueAppend(list: string[] | undefined, item: string): string[] {
    const current = Array.isArray(list) ? list.filter(Boolean) : [];
    return current.includes(item) ? current : [...current, item];
}

function resolveAssetBudgetKeyForProposal(input: {
    proposal: RebalanceProposal;
    asset?: WorkbenchBootstrap["assetUniverse"][number] | null;
}): DaaAssetBudgetOverlayKey | null {
    const parsed = parseDaaAssetKey(input.proposal.assetKey);
    const symbol = normalizeUpper(input.asset?.symbol || input.proposal.symbol || parsed?.symbol);
    const market = normalizeUpper(input.asset?.market || parsed?.market);
    const assetClass = normalizeUpper(input.asset?.assetClass);
    const instrumentType = normalizeUpper(input.asset?.instrumentType);
    const marketGroup = normalizeUpper(input.asset?.marketGroup);

    if (market === "CRYPTO" || assetClass === "CRYPTO" || instrumentType === "CRYPTO" || marketGroup.includes("CRYPTO") || symbol.endsWith("-USD")) {
        return "crypto";
    }
    if (assetClass === "CASH" || instrumentType === "CASH" || marketGroup.includes("CASH") || SHORT_BOND_CASH_SYMBOLS.has(symbol)) {
        return "short_bonds_cash";
    }
    if (assetClass === "BOND" || instrumentType === "BOND" || marketGroup.includes("BOND")) {
        return "duration_bonds";
    }
    if (market === "COMMODITY" || assetClass === "COMMODITY" || instrumentType === "COMMODITY" || marketGroup.includes("COMMODITY") || GOLD_COMMODITY_SYMBOLS.has(symbol) || symbol.endsWith("=F")) {
        return "gold_commodities";
    }
    if (market === "HK" || market === "CN" || marketGroup.includes("HK") || marketGroup.includes("CN") || symbol.endsWith(".HK") || symbol.endsWith(".SS") || symbol.endsWith(".SZ")) {
        return "hk_cn_equity";
    }
    if (market === "US" && (
        assetClass === "EQUITY"
        || assetClass === "ETF"
        || instrumentType === "STOCK"
        || instrumentType === "ETF"
        || marketGroup.includes("US_EQUITY")
        || marketGroup.includes("US_STOCK")
    )) {
        return "us_equity";
    }
    return null;
}

function buildProposalDecisionContextWithMacroBudget(input: {
    proposal: RebalanceProposal;
    overlay: NonNullable<DaaMarketContext["assetBudgets"]>[number];
    appliedScale: number;
    macroShadowNotional: number;
    macroShadowQty: number | null;
    macroShadowDeltaNotional: number;
    reason: string;
}): ProposalDecisionContext {
    const current = input.proposal.decisionContext;
    const flag = input.proposal.side === "BUY"
        ? `宏观预算影子系数 ${Math.round(input.appliedScale * 100)}%`
        : "宏观预算仅影响买入，卖出按原金额审阅";
    return {
        driftReason: current?.driftReason || input.proposal.reason,
        signalAction: current?.signalAction ?? null,
        signalScore: current?.signalScore ?? null,
        signalConfidence: current?.signalConfidence ?? null,
        signalConflict: current?.signalConflict ?? false,
        llmAdjustment: current?.llmAdjustment ?? null,
        llmConfidence: current?.llmConfidence ?? null,
        llmRationale: current?.llmRationale ?? null,
        ruleBasedMarketRegime: current?.ruleBasedMarketRegime ?? null,
        llmMarketRegime: current?.llmMarketRegime ?? null,
        effectiveMarketRegime: current?.effectiveMarketRegime ?? null,
        marketScope: current?.marketScope ?? null,
        marketScopeLabel: current?.marketScopeLabel ?? null,
        marketIndicatorFlags: uniqueAppend(current?.marketIndicatorFlags, flag),
        conflictFlags: current?.conflictFlags ?? [],
        finalQtyMultiplier: current?.finalQtyMultiplier ?? 1,
        assetBudgetKey: input.overlay.key,
        assetBudgetLabel: input.overlay.label,
        assetBudgetStance: input.overlay.stance,
        assetBudgetScale: input.appliedScale,
        macroShadowNotional: input.macroShadowNotional,
        macroShadowQty: input.macroShadowQty,
        macroShadowDeltaNotional: input.macroShadowDeltaNotional,
        macroShadowReason: input.reason,
    };
}

function attachMacroBudgetShadowSizing(input: {
    proposals: RebalanceProposal[];
    bootstrap: WorkbenchBootstrap;
}): RebalanceProposal[] {
    const overlays = input.bootstrap.marketContext?.assetBudgets || [];
    if (!input.proposals.length || !overlays.length) return input.proposals;
    const overlayByKey = new Map(overlays.map((overlay) => [overlay.key, overlay] as const));
    const assetByKey = new Map(input.bootstrap.assetUniverse.map((asset) => [asset.assetKey.toUpperCase(), asset] as const));

    return input.proposals.map((proposal) => {
        const asset = assetByKey.get(proposal.assetKey.toUpperCase()) || null;
        const budgetKey = resolveAssetBudgetKeyForProposal({ proposal, asset });
        const overlay = budgetKey ? overlayByKey.get(budgetKey) : null;
        if (!overlay) return proposal;

        const suggestedNotional = Math.max(0, toFinite(proposal.suggestedNotional, 0));
        const budgetScale = Math.max(0.25, Math.min(1.25, toFinite(overlay.budgetScale, 1)));
        const appliedScale = proposal.side === "BUY" ? budgetScale : 1;
        const macroShadowNotional = suggestedNotional * appliedScale;
        const price = Math.max(0, toFinite(proposal.price, 0));
        const fxRateToBase = Math.max(0, toFinite(proposal.fxRateToBase, 0));
        const macroShadowQty = price > 0 && fxRateToBase > 0
            ? (macroShadowNotional / fxRateToBase) / price
            : null;
        const macroShadowDeltaNotional = macroShadowNotional - suggestedNotional;
        const reason = proposal.side === "BUY"
            ? (overlay.reasons[0] || `${overlay.label} 当前预算系数 ${Math.round(budgetScale * 100)}%`)
            : `${overlay.label} 预算只折扣买入；本条为卖出，影子金额保持原执行金额`;

        return {
            ...proposal,
            decisionContext: buildProposalDecisionContextWithMacroBudget({
                proposal,
                overlay,
                appliedScale,
                macroShadowNotional,
                macroShadowQty,
                macroShadowDeltaNotional,
                reason,
            }),
        };
    });
}

function mapStoreCycleReportToView(report: Awaited<ReturnType<typeof getDaaCycleReport>>): WorkbenchRebalanceCycleReport | null {
    if (!report)
        return null;
    return {
        cycleId: report.cycleId,
        triggerSource: report.triggerSource,
        status: report.cycleStatus,
        createdAt: report.cycleCreatedAt,
        reportCreatedAt: report.reportCreatedAt,
        executionSummary: report.executionSummary,
        beforeSnapshot: report.beforeSnapshot,
        afterSnapshot: report.afterSnapshot,
        pnlAttribution: report.pnlAttribution,
        riskDelta: report.riskDelta,
    };
}

function priceAgeSec(ts: string | null): number | null {
    const iso = normalizeText(ts);
    if (!iso)
        return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms))
        return null;
    return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

function buildWorkbenchMarketDataHealth(input: {
    cacheReadFailed: boolean;
    stats: Awaited<ReturnType<typeof getDaaMarketCacheHealthStats>>;
}): NonNullable<WorkbenchBootstrap["marketDataHealth"]> {
    const totalTracked = Math.max(0, input.stats.freshCount + input.stats.staleCount + input.stats.missingCount);
    const staleRatio = totalTracked > 0 ? input.stats.staleCount / totalTracked : 0;
    const missingRatio = totalTracked > 0 ? input.stats.missingCount / totalTracked : 0;
    let status: NonNullable<WorkbenchBootstrap["marketDataHealth"]>["status"] = "ok";
    if (input.cacheReadFailed
        || input.stats.recentJobFailureRatePct >= 80
        || (totalTracked > 0 && input.stats.freshCount === 0 && (input.stats.missingCount > 0 || input.stats.staleCount > 0))) {
        status = "down";
    }
    else if (input.stats.recentJobFailureRatePct >= 20
        || input.stats.missingCount > 0
        || staleRatio >= 0.4
        || missingRatio >= 0.2) {
        status = "degraded";
    }
    let message = "市场数据缓存正常。";
    if (status === "down") {
        message = input.cacheReadFailed
            ? "市场数据缓存读取失败，工作台已回退到本地快照，价格可能偏旧。"
            : (totalTracked > 0 && input.stats.freshCount === 0)
                ? `当前没有可直接用于交易的新鲜行情：fresh ${input.stats.freshCount} / stale ${input.stats.staleCount} / missing ${input.stats.missingCount}。`
                : `市场数据服务不可用：近 24 小时失败率 ${input.stats.recentJobFailureRatePct.toFixed(1)}%，fresh ${input.stats.freshCount} / stale ${input.stats.staleCount} / missing ${input.stats.missingCount}。`;
    }
    else if (status === "degraded") {
        message = `市场数据部分降级：fresh ${input.stats.freshCount} / stale ${input.stats.staleCount} / missing ${input.stats.missingCount}，近 24 小时失败率 ${input.stats.recentJobFailureRatePct.toFixed(1)}%。`;
    }
    return {
        status,
        freshCount: input.stats.freshCount,
        staleCount: input.stats.staleCount,
        missingCount: input.stats.missingCount,
        recentJobFailureRatePct: input.stats.recentJobFailureRatePct,
        message,
    };
}

function buildCycleDraftFromBootstrap(input: {
    bootstrap: WorkbenchBootstrap;
    triggerReason?: string;
    allowUnheldBuyTargets?: boolean;
}): {
    triggerReason: string;
    driftSnapshot: RebalanceCycle["driftSnapshot"];
    proposals: RebalanceProposal[];
    maxAbsDriftPct: number;
    maxAbsDriftRow: WorkbenchBootstrap["assetUniverse"][number] | null;
} {
    const totalEquity = Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0));
    const availableCash = Math.max(0, toFinite(input.bootstrap.account.investableCash, 0));
    const feeRate = Math.max(0, toFinite(input.bootstrap.execution.feeRateBps, 0)) / 10_000;
    const slippageRate = Math.max(0, toFinite(input.bootstrap.execution.slippageBps, 0)) / 10_000;
    const minNotionalBase = Math.max(0, toFinite(input.bootstrap.execution.minNotional, 0));
    const buyCashMultiplier = (1 + slippageRate) * (1 + feeRate);
    const driftSnapshot: RebalanceCycle["driftSnapshot"] = [];
    const proposals: RebalanceProposal[] = [];
    let maxAbsDrift = 0;
    let maxAbsDriftRow: WorkbenchBootstrap["assetUniverse"][number] | null = null;
    // 跟踪 BUY 提案累计预计占用现金（含滑点/手续费）
    let buyCashReserved = 0;
    for (const row of input.bootstrap.assetUniverse) {
        const hasVisibleHolding = isVisibleHolding(row);
        if (!(row.watchEnabled || hasVisibleHolding))
            continue;
        const actualPct = toFinite(row.actualWeightPct, 0) / 100;
        const targetPct = toFinite(row.targetWeightPct, 0) / 100;
        const driftPct = actualPct - targetPct;
        driftSnapshot.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            actualPct,
            targetPct,
            driftPct,
        });
        const absDrift = Math.abs(driftPct);
        if (absDrift > maxAbsDrift) {
            maxAbsDrift = absDrift;
            maxAbsDriftRow = row;
        }
        if (absDrift < 0.001)
            continue;
        const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        if (!(price > 0) || !(totalEquity > 0))
            continue;
        let suggestedNotional = Math.abs(driftPct) * totalEquity;
        if (!(suggestedNotional > 0))
            continue;
        const side: "BUY" | "SELL" = driftPct > 0 ? "SELL" : "BUY";
        const isUnheldTargetEntry = !hasVisibleHolding && side === "BUY";
        if (isUnheldTargetEntry && input.allowUnheldBuyTargets !== true)
            continue;

        // BUY 提案现金上限防护：累计买入总成本（含滑点/手续费）不超过可用现金
        if (side === "BUY") {
            const cashRemaining = Math.max(0, availableCash - buyCashReserved);
            if (cashRemaining <= 0)
                continue;
            const maxAffordableNotional = buyCashMultiplier > 0
                ? (cashRemaining / buyCashMultiplier)
                : cashRemaining;
            if (!(maxAffordableNotional > 0))
                continue;
            if (suggestedNotional > maxAffordableNotional) {
                suggestedNotional = maxAffordableNotional;
            }
        }

        if (minNotionalBase > 0 && suggestedNotional + 1e-9 < minNotionalBase)
            continue;

        const fxRateToBase = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null;
        if (!fxRateToBase)
            continue;
        const localNotional = suggestedNotional / fxRateToBase;
        const sizing = normalizeOrderSizing({
            side,
            market: row.market,
            assetClass: row.assetClass,
            instrumentType: row.instrumentType,
            marketGroup: row.marketGroup,
            price,
            fxRateToBase,
            qty: localNotional / price,
            holdingQty: row.holdingQty,
            sellAll: side === "SELL" && (targetPct <= 0 || suggestedNotional + 1e-9 >= Math.max(0, row.valuationBase || 0)),
            minNotionalBase,
        });
        const suggestedQty = sizing.qty;
        if (!(suggestedQty > 0))
            continue;
        suggestedNotional = sizing.notionalBase;
        if (side === "BUY") {
            buyCashReserved += suggestedNotional * buyCashMultiplier;
        }
        const targetSource = hasVisibleHolding
            ? "持仓目标权重回归"
            : "观察列表目标入场";
        proposals.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            currency: row.currency,
            fxRateToBase,
            side,
            suggestedQty,
            suggestedNotional,
            price: sizing.price,
            sellAll: sizing.sellAll,
            reason: `${targetSource}：偏移 ${(driftPct * 100).toFixed(2)}%，回归目标权重`,
            selected: true,
            hfContribution: row.hfSignal
                ? `${row.hfSignal.icon} ${row.hfSignal.label} ${row.hfSignal.aggregatedScorePct.toFixed(1)}%`
                : null,
            targetWeightPct: targetPct * 100,
        });
    }
    const triggerReason = normalizeText(input.triggerReason)
        || (maxAbsDriftRow
            ? `${maxAbsDriftRow.symbol} 偏移 ${(maxAbsDrift * 100).toFixed(2)}%`
            : "组合偏移触发再平衡建议");
    return {
        triggerReason,
        driftSnapshot,
        proposals,
        maxAbsDriftPct: maxAbsDrift * 100,
        maxAbsDriftRow,
    };
}

function buildRiskCycleDraft(input: {
    bootstrap: WorkbenchBootstrap;
    perAssetStopLossPct: number;
    perAssetTakeProfitPct: number;
}): {
    triggerReason: string;
    proposals: RebalanceProposal[];
    driftSnapshot: RebalanceCycle["driftSnapshot"];
    riskHits: Array<{
        symbol: string;
        kind: "stop_loss" | "take_profit";
        pnlPct: number;
    }>;
} | null {
    const proposals: RebalanceProposal[] = [];
    const riskHits: Array<{
        symbol: string;
        kind: "stop_loss" | "take_profit";
        pnlPct: number;
    }> = [];
    const triggerByAssetKey = new Map(collectRiskTriggerAssets({
        rows: input.bootstrap.assetUniverse,
        perAssetStopLossPct: input.perAssetStopLossPct,
        perAssetTakeProfitPct: input.perAssetTakeProfitPct,
    }).map((hit) => [hit.assetKey, hit]));
    const driftSnapshot: RebalanceCycle["driftSnapshot"] = [];
    for (const row of input.bootstrap.assetUniverse) {
        if (!(row.watchEnabled || isVisibleHolding(row)))
            continue;
        driftSnapshot.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            actualPct: (row.actualWeightPct || 0) / 100,
            targetPct: (row.targetWeightPct || 0) / 100,
            driftPct: ((row.actualWeightPct || 0) - (row.targetWeightPct || 0)) / 100,
        });
        const hit = triggerByAssetKey.get(row.assetKey);
        if (!hit)
            continue;
        if (!(row.holdingQty > 0) || !(row.valuationBase && row.valuationBase > 0))
            continue;
        const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        if (!(px > 0))
            continue;
        const isStopLoss = hit.triggerType === "stop_loss";
        const pnlPct = hit.pnlPct;
        const sellRatio = isStopLoss ? 1 : 0.5;
        const suggestedNotional = Math.max(0, (row.valuationBase || 0) * sellRatio);
        if (!(suggestedNotional > 0))
            continue;
        const fxRateToBase = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null;
        if (!fxRateToBase) continue;
        const localNotional = suggestedNotional / fxRateToBase;
        const sizing = normalizeOrderSizing({
            side: "SELL",
            market: row.market,
            assetClass: row.assetClass,
            instrumentType: row.instrumentType,
            marketGroup: row.marketGroup,
            price: px,
            fxRateToBase,
            qty: Math.min(row.holdingQty, localNotional / px),
            holdingQty: row.holdingQty,
            sellAll: isStopLoss,
            minNotionalBase: input.bootstrap.execution.minNotional,
        });
        const suggestedQty = sizing.qty;
        if (!(suggestedQty > 0))
            continue;
        proposals.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            currency: row.currency,
            fxRateToBase,
            side: "SELL",
            suggestedQty,
            suggestedNotional: sizing.notionalBase,
            price: sizing.price,
            sellAll: sizing.sellAll,
            reason: isStopLoss
                ? `触发止损阈值：浮亏 ${Math.abs(pnlPct).toFixed(2)}%`
                : `触发止盈阈值：浮盈 ${pnlPct.toFixed(2)}%`,
            selected: true,
            hfContribution: row.hfSignal ? `${row.hfSignal.icon} ${row.hfSignal.label}` : null,
        });
        riskHits.push({
            symbol: row.symbol,
            kind: hit.triggerType,
            pnlPct,
        });
    }
    if (!proposals.length || !riskHits.length)
        return null;
    const top = riskHits[0];
    const triggerReason = top.kind === "stop_loss"
        ? `${top.symbol} 触发止损(${Math.abs(top.pnlPct).toFixed(2)}%)`
        : `${top.symbol} 触发止盈(${top.pnlPct.toFixed(2)}%)`;
    return {
        triggerReason,
        proposals,
        driftSnapshot,
        riskHits,
    };
}

function calcPortfolioHhiPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    const weights = rows
        .filter((row) => isVisibleHolding(row) && (row.actualWeightPct || 0) > 0)
        .map((row) => Math.max(0, row.actualWeightPct || 0));
    if (!weights.length)
        return 0;
    return weights.reduce((sum, weightPct) => sum + ((weightPct / 100) ** 2), 0) * 100;
}

function calcMaxWeightPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    return rows
        .filter(isVisibleHolding)
        .reduce((max, row) => Math.max(max, Math.max(0, toFinite(row.actualWeightPct, 0))), 0);
}

function calcMaxDriftPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    return rows
        .filter((row) => isVisibleHolding(row) || row.watchEnabled || row.targetWeightPct > 0)
        .reduce((max, row) => Math.max(max, Math.abs(toFinite(row.gapPct, 0))), 0);
}

function calcMaxDrawdownPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    let worst = 0;
    for (const row of rows) {
        if (!isVisibleHolding(row))
            continue;
        worst = Math.max(worst, resolvePositionDrawdownPct(row) ?? 0);
    }
    return Math.max(0, worst);
}

function toCycleReportSnapshot(bootstrap: WorkbenchBootstrap) {
    const holdingsValue = bootstrap.assetUniverse
        .filter(isVisibleHolding)
        .reduce((sum, row) => sum + Math.max(0, toFinite(row.valuationBase, 0)), 0);
    return {
        totalEquity: Math.max(0, toFinite(bootstrap.account.totalEquity, 0)),
        holdingsValue,
        cash: Math.max(0, toFinite(bootstrap.account.cash, 0)),
        hhiPct: calcPortfolioHhiPct(bootstrap.assetUniverse),
        maxWeightPct: calcMaxWeightPct(bootstrap.assetUniverse),
        maxDriftPct: calcMaxDriftPct(bootstrap.assetUniverse),
        maxDrawdownPct: calcMaxDrawdownPct(bootstrap.assetUniverse),
    };
}

async function enrichRiskCheckWithCorrelation(
    riskCheck: PreTradeRiskCheck,
    assetUniverse: WorkbenchBootstrap["assetUniverse"],
    correlationCapPct: number,
): Promise<PreTradeRiskCheck> {
    const holdingSymbols = assetUniverse
        .filter((row) => row.watchEnabled && row.targetWeightPct > 0)
        .map((row) => row.symbol);

    if (holdingSymbols.length < 2) {
        return {
            ...riskCheck,
            items: [
                ...riskCheck.items,
                {
                    rule: "correlation" as PreTradeRiskRule,
                    status: "pass",
                    current: 0,
                    limit: correlationCapPct * 100,
                    message: "持仓不足 2 个标的，无需相关性检查",
                },
            ],
        };
    }

    try {
        const matrix = await computeCorrelationMatrix({
            symbols: holdingSymbols,
            lookbackDays: 252,
            highThreshold: correlationCapPct,
        });

        const maxCorrPct = matrix.maxCorrelation * 100;
        const limitPct = correlationCapPct * 100;
        const pair = matrix.maxCorrelationPair;
        const pairLabel = pair ? `${pair.symbolA}/${pair.symbolB}` : "";

        const status: "pass" | "warn" | "block" = maxCorrPct > limitPct ? "warn" : "pass";

        const items: PreTradeRiskCheckItem[] = [
            ...riskCheck.items,
            {
                rule: "correlation" as PreTradeRiskRule,
                status,
                current: Number(maxCorrPct.toFixed(2)),
                limit: Number(limitPct.toFixed(2)),
                message: status === "warn"
                    ? `${pairLabel} 相关性 ${maxCorrPct.toFixed(1)}% 超过阈值 ${limitPct.toFixed(1)}%，存在伪分散化风险（高相关对数: ${matrix.highCorrelationCount}）`
                    : `最大相关性 ${maxCorrPct.toFixed(1)}%（${pairLabel}），低于阈值 ${limitPct.toFixed(1)}%`,
            },
        ];

        const hasBlock = items.some((item) => item.status === "block");
        const hasWarn = items.some((item) => item.status === "warn");

        return {
            overallStatus: hasBlock ? "block" : (hasWarn ? "warn" : "pass"),
            items,
        };
    } catch (err) {
        logSwallowed("workbenchModeling.correlationCheck", err);
        return {
            ...riskCheck,
            items: [
                ...riskCheck.items,
                {
                    rule: "correlation" as PreTradeRiskRule,
                    status: "pass",
                    current: 0,
                    limit: correlationCapPct * 100,
                    message: "相关性数据不足或计算失败，跳过检查",
                },
            ],
        };
    }
}

export {
  toFinite,
  toPositive,
  normalizeText,
  buildHfSignalMap,
  buildPreTradeRiskCheck,
  buildPreTradeRiskCheckFromBootstrap,
  enrichRiskCheckWithCorrelation,
  buildManualPreTradeRiskCheck,
  mapStoreCycleToView,
  buildMarketFacts,
  attachMacroBudgetShadowSizing,
  mapStoreCycleReportToView,
  priceAgeSec,
  buildWorkbenchMarketDataHealth,
  buildCycleDraftFromBootstrap,
  buildRiskCycleDraft,
  toCycleReportSnapshot,
};
