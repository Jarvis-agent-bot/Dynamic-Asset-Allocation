import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeText, toFinite, toPositive } from "@/src/daa/utils/normalize";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";
import { marketRegimeLabelZh } from "@/src/daa/modules/marketContext/marketIndicatorService";
import {
  appendDaaTriggerEvent,
  getDaaCycleReport,
  getDaaHumanIngestState,
  getDaaSystemConfig,
  getDaaMarketCacheHealthStats,
  type DaaStoreRebalanceCycle,
} from "@/src/daa/store/daaStorePg";
import { buildFxLookupToBase, summarizeMarkToMarketPortfolio } from "@/src/daa/modules/portfolio/portfolioValuation";
import { computeCorrelationMatrix } from "./correlationService";
import type {
  HfSignalSummary,
  PreTradeRiskRule,
  PreTradeRiskCheckItem,
  PreTradeRiskCheck,
  RebalanceCycle,
  RebalanceProposal,
  RebalanceTriggerSource,
  WorkbenchBootstrap,
  WorkbenchRebalanceCycleReport,
} from "./workbenchTypes";
import { WorkbenchDomainError, type WorkbenchDomainErrorCode } from "./workbenchErrors";

function pickArray(value: unknown): string[] {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function toPct(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num))
        return 0;
    return num;
}

function toIsoByMs(ms: number): string {
    return new Date(ms).toISOString();
}

function normalizeTimeZoneOrUtc(value: unknown): string {
    const text = normalizeText(value);
    if (!text)
        return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: text }).format(new Date());
        return text;
    }
    catch (err) {
        logSwallowed("workbenchShared.resolveTimezone", err);
        return "UTC";
    }
}

function toUtcMinuteOfDay(value: string): number | null {
    const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizeText(value));
    if (!matched)
        return null;
    return Number(matched[1]) * 60 + Number(matched[2]);
}

function isPastUtcTime(now: Date, hhmm: string): boolean {
    const minute = toUtcMinuteOfDay(hhmm);
    if (minute == null)
        return true;
    const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    return nowMinute >= minute;
}

function getZonedYmd(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
} {
    try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const parts = formatter.formatToParts(date);
        const year = Number(parts.find((item) => item.type === "year")?.value || "");
        const month = Number(parts.find((item) => item.type === "month")?.value || "");
        const day = Number(parts.find((item) => item.type === "day")?.value || "");
        if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
            return { year, month, day };
        }
    }
    catch (err) {
        logSwallowed("workbenchShared.parseConfig", err);
    }
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

type CalendarFrequency = "every_3_days" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";

function isCalendarMonthDue(month: number, frequency: CalendarFrequency): boolean {
    // every_3_days 和 weekly 不依赖月份判断，始终返回 true（由 nextCalendarDueDate 控制实际间隔）
    if (frequency === "every_3_days" || frequency === "weekly" || frequency === "monthly")
        return true;
    if (frequency === "quarterly")
        return month === 1 || month === 4 || month === 7 || month === 10;
    if (frequency === "semi_annual")
        return month === 1 || month === 7;
    return month === 1;
}

function buildCalendarPeriodKey(input: {
    date: Date;
    timeZone: string;
    frequency: CalendarFrequency;
}): string {
    const { year, month, day } = getZonedYmd(input.date, input.timeZone);
    if (input.frequency === "every_3_days") {
        // 按 3 天一个周期，用 epoch day 整除 3
        const epochDay = Math.floor(input.date.getTime() / 86_400_000);
        return `3d-${Math.floor(epochDay / 3)}`;
    }
    if (input.frequency === "weekly") {
        // ISO 周号
        const d = new Date(Date.UTC(year, month - 1, day));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    }
    if (input.frequency === "annual")
        return `${year}`;
    if (input.frequency === "semi_annual")
        return `${year}-H${month <= 6 ? 1 : 2}`;
    if (input.frequency === "quarterly")
        return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    return `${year}-${String(month).padStart(2, "0")}`;
}

function nextCalendarDueDate(input: {
    frequency: CalendarFrequency;
    dayOfMonth: number;
    nowMs?: number;
}): string {
    const now = new Date(input.nowMs ?? Date.now());

    // every_3_days: 从当前时间起每 3 天
    if (input.frequency === "every_3_days") {
        const candidate = new Date(now.getTime() + 3 * 86_400_000);
        candidate.setUTCHours(0, 0, 0, 0);
        return toIsoByMs(candidate.getTime());
    }

    // weekly: 下一个周一（dayOfMonth 被忽略）
    if (input.frequency === "weekly") {
        const candidate = new Date(now.getTime());
        candidate.setUTCHours(0, 0, 0, 0);
        const daysUntilMonday = (8 - (candidate.getUTCDay() || 7)) % 7 || 7;
        candidate.setUTCDate(candidate.getUTCDate() + daysUntilMonday);
        return toIsoByMs(candidate.getTime());
    }

    const stepMonths = input.frequency === "quarterly"
        ? 3
        : (input.frequency === "semi_annual" ? 6 : (input.frequency === "annual" ? 12 : 1));
    const day = Math.max(1, Math.min(28, Math.trunc(input.dayOfMonth || 1)));
    let year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    let candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
    while (candidate <= now.getTime()) {
        month += stepMonths;
        while (month > 11) {
            month -= 12;
            year += 1;
        }
        candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
    }
    return toIsoByMs(candidate);
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

export function computeHhiPct(weightsPct: number[]): number {
    if (!weightsPct.length)
        return 0;
    return weightsPct.reduce((sum, weight) => sum + ((weight / 100) ** 2), 0) * 100;
}

function isCycleTerminal(status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function isCycleExecutable(status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"]): boolean {
    return status === "generated" || status === "reviewing";
}

export function assertCycleMutable(cycle: {
    cycleId: string;
    status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"];
}) {
    if (!isCycleTerminal(cycle.status))
        return;
    throw new WorkbenchDomainError("CYCLE_IMMUTABLE", "该周期已终态，请生成新周期继续调仓。", {
        details: {
            cycleId: cycle.cycleId,
            cycleStatus: cycle.status,
        },
    });
}

export function assertCycleExecutable(cycle: {
    cycleId: string;
    status: RebalanceCycle["status"] | DaaStoreRebalanceCycle["status"];
}, actionLabel: "execute" | "summary") {
    if (isCycleExecutable(cycle.status))
        return;
    const code: WorkbenchDomainErrorCode = actionLabel === "execute" && cycle.status === "completed"
        ? "CYCLE_ALREADY_COMPLETED"
        : "CYCLE_NOT_EXECUTABLE";
    const message = actionLabel === "execute"
        ? "该周期不可执行，请生成新周期继续调仓。"
        : "该周期不可生成执行摘要，请生成新周期继续调仓。";
    throw new WorkbenchDomainError(code, message, {
        details: {
            cycleId: cycle.cycleId,
            cycleStatus: cycle.status,
        },
    });
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
    const symbolByAssetKey = new Map<string, string>();
    for (const row of input.assetUniverse) {
        currentValueByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.valuationBase, 0)));
        symbolByAssetKey.set(row.assetKey, row.symbol);
    }
    for (const proposal of input.proposals) {
        const currentValue = currentValueByAssetKey.get(proposal.assetKey) || 0;
        const proposalNotional = Math.max(0, toFinite(proposal.suggestedNotional, 0));
        const delta = proposal.side === "BUY" ? proposalNotional : -proposalNotional;
        currentValueByAssetKey.set(proposal.assetKey, Math.max(0, currentValue + delta));
        if (!symbolByAssetKey.has(proposal.assetKey)) {
            symbolByAssetKey.set(proposal.assetKey, proposal.symbol);
        }
    }
    const projectedAssetRows = Array.from(currentValueByAssetKey.entries())
        .map(([assetKey, nextValue]) => ({
        assetKey,
        symbol: symbolByAssetKey.get(assetKey) || assetKey,
        nextValue: Math.max(0, nextValue),
    }))
        .filter((row) => row.nextValue > 0);
    const totalProjectedAssetValue = projectedAssetRows.reduce((sum, row) => sum + row.nextValue, 0);
    const totalNotional = input.proposals.reduce((sum, row) => sum + Math.max(0, toFinite(row.suggestedNotional, 0)), 0);
    const riskNavBase = input.totalEquity > 0
        ? input.totalEquity
        : Math.max(totalProjectedAssetValue, totalNotional, 1e-9);
    const projectedWeights = projectedAssetRows.map((row) => ({
        ...row,
        weightPct: riskNavBase > 0 ? (row.nextValue / riskNavBase) * 100 : 0,
    }));
    const maxProjected = projectedWeights.reduce((max, row) => row.weightPct > max.weightPct ? row : max, {
        assetKey: "",
        symbol: "组合",
        nextValue: 0,
        weightPct: 0,
    });
    items.push({
        rule: "max_position",
        status: maxProjected.weightPct > maxPositionLimitPct ? "block" : "pass",
        current: maxProjected.weightPct,
        limit: maxPositionLimitPct,
        message: maxProjected.weightPct > maxPositionLimitPct
            ? `${maxProjected.symbol || "标的"} 交易后仓位 ${maxProjected.weightPct.toFixed(2)}% 超过上限 ${maxPositionLimitPct.toFixed(2)}%`
            : `最大单一持仓交易后仓位 ${maxProjected.weightPct.toFixed(2)}%`,
    });
    const totalWeightPct = projectedWeights.reduce((sum, row) => sum + row.weightPct, 0);
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
    const hhi = computeHhiPct(projectedWeights.map((row) => row.weightPct));
    items.push({
        rule: "concentration",
        status: hhi > maxConcentrationPct ? "warn" : "pass",
        current: hhi,
        limit: maxConcentrationPct,
        message: hhi > maxConcentrationPct
            ? `交易后组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
            : `交易后组合集中度(HHI) ${hhi.toFixed(2)}`,
    });
    const worstDrawdown = input.assetUniverse.reduce((worst, row) => {
        const costPerUnit = calcHoldingCostPerUnit(row);
        if (!(row.holdingQty > 0) || !(costPerUnit > 0))
            return worst;
        const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        if (!(price > 0))
            return worst;
        const drawdownPct = ((costPerUnit - price) / costPerUnit) * 100;
        return Math.max(worst, drawdownPct);
    }, 0);
    items.push({
        rule: "stop_loss_breach",
        status: worstDrawdown > stopLossPct ? "warn" : "pass",
        current: worstDrawdown,
        limit: stopLossPct,
        message: worstDrawdown > stopLossPct
            ? `存在持仓浮亏 ${worstDrawdown.toFixed(2)}%，超过止损线 ${stopLossPct.toFixed(2)}%`
            : `持仓止损检查通过（最大浮亏 ${worstDrawdown.toFixed(2)}%）`,
    });
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
    /** Agent Config Overlay 的风控收紧建议（取 min(agent, config)） */
    agentRiskAdjustments?: Array<{ assetKey: string; maxPositionPctOverride: number }>;
}): PreTradeRiskCheck {
    // Agent overlay: 如果有 riskAdjustments，取所有建议中最低的上限与全局 config 的 min
    let effectiveMaxPositionPct = input.systemConfig.strategy.constraints.maxPositionPct;
    if (input.agentRiskAdjustments?.length) {
      const lowestAgentLimit = Math.min(...input.agentRiskAdjustments.map(a => a.maxPositionPctOverride));
      effectiveMaxPositionPct = Math.min(effectiveMaxPositionPct, lowestAgentLimit);
    }
    return buildPreTradeRiskCheck({
        assetUniverse: input.bootstrap.assetUniverse,
        proposals: input.proposals,
        totalEquity: Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0)),
        availableCash: Math.max(0, toFinite(input.bootstrap.account.investableCash, 0)),
        constraints: {
            maxPositionPct: effectiveMaxPositionPct,
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
    for (const row of input.assetUniverse) {
        currentValueByAssetKey.set(row.assetKey, Math.max(0, toFinite(row.valuationBase, 0)));
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
            nextValue,
            weightPct: riskNavBase > 0 ? (nextValue / riskNavBase) * 100 : 0,
        };
    })
        .filter((row) => row.nextValue > 0);
    const projectedWeightPct = riskNavBase > 0 ? (nextProposalValue / riskNavBase) * 100 : 0;
    items.push({
        rule: "max_position",
        status: projectedWeightPct > maxPositionLimitPct ? "block" : "pass",
        current: projectedWeightPct,
        limit: maxPositionLimitPct,
        message: projectedWeightPct > maxPositionLimitPct
            ? `${input.proposal.symbol} 交易后仓位 ${projectedWeightPct.toFixed(2)}% 超过上限 ${maxPositionLimitPct.toFixed(2)}%`
            : `${input.proposal.symbol} 交易后仓位 ${projectedWeightPct.toFixed(2)}%`,
    });
    const investedWeightPct = projectedWeights.reduce((sum, row) => sum + row.weightPct, 0);
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
    const hhi = computeHhiPct(projectedWeights.map((row) => row.weightPct));
    items.push({
        rule: "concentration",
        status: hhi > maxConcentrationPct ? "warn" : "pass",
        current: hhi,
        limit: maxConcentrationPct,
        message: hhi > maxConcentrationPct
            ? `交易后组合集中度(HHI) ${hhi.toFixed(2)} 超过警戒 ${maxConcentrationPct.toFixed(2)}`
            : `交易后组合集中度(HHI) ${hhi.toFixed(2)}`,
    });
    const worstDrawdown = input.assetUniverse.reduce((worst, row) => {
        const costPerUnit = calcHoldingCostPerUnit(row);
        if (!(row.holdingQty > 0) || !(costPerUnit > 0))
            return worst;
        const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        if (!(price > 0))
            return worst;
        const drawdownPct = ((costPerUnit - price) / costPerUnit) * 100;
        return Math.max(worst, drawdownPct);
    }, 0);
    items.push({
        rule: "stop_loss_breach",
        status: worstDrawdown > stopLossPct ? "warn" : "pass",
        current: worstDrawdown,
        limit: stopLossPct,
        message: worstDrawdown > stopLossPct
            ? `存在持仓浮亏 ${worstDrawdown.toFixed(2)}%，超过止损线 ${stopLossPct.toFixed(2)}%`
            : `持仓止损检查通过（最大浮亏 ${worstDrawdown.toFixed(2)}%）`,
    });
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
        executedAt: cycle.executedAt,
        executedOrders: cycle.executedOrders,
        executionSummary: cycle.executionSummary,
        cancelledAt: cycle.cancelledAt,
        cancelReason: cycle.cancelReason,
        notes: cycle.notes,
        marketContext: cycle.marketContext || null,
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
    return marketContext.scopes.slice(0, 4).map((scope) => {
        const lead = scope.indicators[0] || null;
        const value = lead?.rawValue == null ? "N/A" : `${lead.rawValue}${lead.unit || ""}`;
        const percentile = lead?.percentile252 == null ? "N/A" : `${lead.percentile252.toFixed(1)}%`;
        return `${scope.label} ${marketRegimeLabelZh(scope.regime)} / 买入 ${Math.round(scope.buyScale * 100)}% / ${lead?.label || "指标"} ${value} / 近一年位置 ${percentile}`;
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

function buildTargetWeightsFromConfig(input: {
    targetWeightsRaw: Record<string, unknown>;
    assetRows: Array<{
        assetKey: string;
        symbol: string;
        watchEnabled: boolean;
        targetWeightHint: number;
    }>;
}): Record<string, number> {
    const out: Record<string, number> = {};
    const watchRows = input.assetRows.filter((row) => row.watchEnabled);
    for (const [rawKey, rawValue] of Object.entries(input.targetWeightsRaw || {})) {
        const weight = Number(rawValue);
        const keyText = normalizeText(rawKey).toUpperCase();
        if (!keyText) {
            throw new Error("targetWeights key must not be empty");
        }
        if (!Number.isFinite(weight)) {
            throw new Error(`targetWeights[${keyText}] must be a finite number`);
        }
        if (weight < 0) {
            throw new Error(`targetWeights[${keyText}] must be non-negative`);
        }
        if (weight === 0)
            continue;
        const parsedAssetKey = parseDaaAssetKey(keyText);
        if (!parsedAssetKey) {
            throw new Error(`targetWeights key ${keyText} is invalid, expected MARKET::SYMBOL`);
        }
        const assetKey = `${parsedAssetKey.market}::${parsedAssetKey.symbol}`;
        out[assetKey] = (out[assetKey] ?? 0) + weight;
    }
    for (const row of watchRows) {
        if (!row.assetKey)
            continue;
        const parsedAssetKey = parseDaaAssetKey(row.assetKey);
        if (!parsedAssetKey) {
            throw new Error(`asset universe row has invalid assetKey: ${row.assetKey}`);
        }
        const hint = Math.max(0, toFinite(row.targetWeightHint, 0));
        if (hint > 0) {
            out[row.assetKey] = hint;
            continue;
        }
        if (out[row.assetKey] != null) {
            delete out[row.assetKey];
        }
    }
    return out;
}

function computeTotalEquity(input: {
    rows: Array<{
        symbol: string;
        market: string;
        currency: string;
        holdingQty: number;
        holdingPrice: number;
        lastPrice: number;
    }>;
    fxRates: Array<{
        baseCcy: string;
        quoteCcy: string;
        rate: number;
    }>;
    baseCurrency: string;
    cash: number;
}): number {
    const fxLookup = buildFxLookupToBase(input.fxRates);
    return summarizeMarkToMarketPortfolio({
        positions: input.rows.map((row) => ({
            symbol: row.symbol,
            market: row.market,
            currency: row.currency,
            qty: toPositive(row.holdingQty, 0),
            lastPrice: row.lastPrice,
            holdingPrice: row.holdingPrice,
        })),
        baseCurrency: input.baseCurrency,
        cash: input.cash,
        fxLookup,
    }).totalEquity;
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
}): {
    triggerReason: string;
    driftSnapshot: RebalanceCycle["driftSnapshot"];
    proposals: RebalanceProposal[];
    maxAbsDriftPct: number;
    maxAbsDriftRow: WorkbenchBootstrap["assetUniverse"][number] | null;
} {
    const totalEquity = Math.max(0, toFinite(input.bootstrap.account.totalEquity, 0));
    const availableCash = Math.max(0, toFinite(input.bootstrap.account.investableCash, 0));
    const driftSnapshot: RebalanceCycle["driftSnapshot"] = [];
    const proposals: RebalanceProposal[] = [];
    let maxAbsDrift = 0;
    let maxAbsDriftRow: WorkbenchBootstrap["assetUniverse"][number] | null = null;
    // 跟踪 BUY 提案累计金额，不超过可用现金
    let buyNotionalUsed = 0;
    for (const row of input.bootstrap.assetUniverse) {
        if (!(row.watchEnabled || row.holdingQty > 0))
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

        // BUY 提案现金上限防护：累计买入金额不超过可用现金
        if (side === "BUY") {
            const cashRemaining = Math.max(0, availableCash - buyNotionalUsed);
            if (cashRemaining <= 0) continue; // 现金已耗尽，跳过后续 BUY 提案
            if (suggestedNotional > cashRemaining) {
                suggestedNotional = cashRemaining; // 截断至可用现金
            }
            buyNotionalUsed += suggestedNotional;
        }

        const fxRateToBase = row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null;
        const localNotional = fxRateToBase ? (suggestedNotional / fxRateToBase) : suggestedNotional;
        const suggestedQty = localNotional / price;
        proposals.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            currency: row.currency,
            fxRateToBase,
            side,
            suggestedQty,
            suggestedNotional,
            price,
            reason: `偏移 ${(driftPct * 100).toFixed(2)}%，回归目标权重`,
            selected: true,
            hfContribution: row.hfSignal
                ? `${row.hfSignal.icon} ${row.hfSignal.label} ${row.hfSignal.aggregatedScorePct.toFixed(1)}%`
                : null,
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

function buildTriggerEventIdempotencyKey(input: {
    triggerSource: RebalanceTriggerSource;
    triggerReason: string;
    cycleId?: string | null;
}): string {
    const source = normalizeText(input.triggerSource).toLowerCase() || "manual";
    const reason = normalizeText(input.triggerReason).toLowerCase().replace(/\s+/g, "_").slice(0, 80) || "na";
    if (input.cycleId)
        return `cycle:${normalizeText(input.cycleId)}`;
    const hourSlot = new Date().toISOString().slice(0, 13);
    return `evt:${source}:${reason}:${hourSlot}`;
}

async function appendTriggerEventSafe(input: {
    triggerSource: RebalanceTriggerSource;
    triggerReason: string;
    cycleId?: string | null;
    status: "accepted" | "skipped" | "conflict";
    detailsJson?: Record<string, unknown>;
}) {
    try {
        await appendDaaTriggerEvent({
            idempotencyKey: buildTriggerEventIdempotencyKey({
                triggerSource: input.triggerSource,
                triggerReason: input.triggerReason,
                cycleId: input.cycleId,
            }),
            triggerSource: input.triggerSource,
            triggerReason: input.triggerReason,
            cycleId: input.cycleId,
            status: input.status,
            detailsJson: input.detailsJson || {},
        });
    }
    catch (err) {
        logSwallowed("workbenchShared.appendTriggerEvent", err);
    }
}

function calcHoldingCostPerUnit(row: Pick<WorkbenchBootstrap["assetUniverse"][number], "holdingQty" | "costBasis" | "holdingPrice">): number {
    if (row.holdingQty > 0 && row.costBasis != null && row.costBasis > 0) {
        return row.costBasis / row.holdingQty;
    }
    if (row.holdingPrice > 0)
        return row.holdingPrice;
    return 0;
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
    const stopLossPct = Math.max(0, input.perAssetStopLossPct) * 100;
    const takeProfitPct = Math.max(0, input.perAssetTakeProfitPct) * 100;
    const proposals: RebalanceProposal[] = [];
    const riskHits: Array<{
        symbol: string;
        kind: "stop_loss" | "take_profit";
        pnlPct: number;
    }> = [];
    const driftSnapshot: RebalanceCycle["driftSnapshot"] = [];
    for (const row of input.bootstrap.assetUniverse) {
        if (!(row.watchEnabled || row.holdingQty > 0))
            continue;
        driftSnapshot.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            actualPct: (row.actualWeightPct || 0) / 100,
            targetPct: (row.targetWeightPct || 0) / 100,
            driftPct: ((row.actualWeightPct || 0) - (row.targetWeightPct || 0)) / 100,
        });
        if (!(row.holdingQty > 0) || !(row.valuationBase && row.valuationBase > 0))
            continue;
        const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        if (!(px > 0))
            continue;
        const costPerUnit = calcHoldingCostPerUnit(row);
        if (!(costPerUnit > 0))
            continue;
        const pnlPct = ((px - costPerUnit) / costPerUnit) * 100;
        const isStopLoss = stopLossPct > 0 && pnlPct <= -stopLossPct;
        const isTakeProfit = takeProfitPct > 0 && pnlPct >= takeProfitPct;
        if (!isStopLoss && !isTakeProfit)
            continue;
        const sellRatio = isStopLoss ? 1 : 0.5;
        const suggestedNotional = Math.max(0, (row.valuationBase || 0) * sellRatio);
        if (!(suggestedNotional > 0))
            continue;
        const localNotional = row.fxRateToBase && row.fxRateToBase > 0 ? (suggestedNotional / row.fxRateToBase) : suggestedNotional;
        const suggestedQty = Math.min(row.holdingQty, localNotional / px);
        if (!(suggestedQty > 0))
            continue;
        proposals.push({
            assetKey: row.assetKey,
            symbol: row.symbol,
            currency: row.currency,
            fxRateToBase: row.fxRateToBase && row.fxRateToBase > 0 ? row.fxRateToBase : null,
            side: "SELL",
            suggestedQty,
            suggestedNotional,
            price: px,
            reason: isStopLoss
                ? `触发止损阈值：浮亏 ${Math.abs(pnlPct).toFixed(2)}%`
                : `触发止盈阈值：浮盈 ${pnlPct.toFixed(2)}%`,
            selected: true,
            hfContribution: row.hfSignal ? `${row.hfSignal.icon} ${row.hfSignal.label}` : null,
        });
        riskHits.push({
            symbol: row.symbol,
            kind: isStopLoss ? "stop_loss" : "take_profit",
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
        .filter((row) => row.holdingQty > 0 && (row.actualWeightPct || 0) > 0)
        .map((row) => Math.max(0, row.actualWeightPct || 0));
    if (!weights.length)
        return 0;
    return weights.reduce((sum, weightPct) => sum + ((weightPct / 100) ** 2), 0) * 100;
}

function calcMaxWeightPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    return rows.reduce((max, row) => Math.max(max, Math.max(0, toFinite(row.actualWeightPct, 0))), 0);
}

function calcMaxDriftPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    return rows.reduce((max, row) => Math.max(max, Math.abs(toFinite(row.gapPct, 0))), 0);
}

function calcMaxDrawdownPct(rows: WorkbenchBootstrap["assetUniverse"]): number {
    let worst = 0;
    for (const row of rows) {
        if (!(row.holdingQty > 0))
            continue;
        const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
        const costPerUnit = calcHoldingCostPerUnit(row);
        if (!(px > 0) || !(costPerUnit > 0))
            continue;
        const drawdown = ((costPerUnit - px) / costPerUnit) * 100;
        worst = Math.max(worst, drawdown);
    }
    return Math.max(0, worst);
}

function toCycleReportSnapshot(bootstrap: WorkbenchBootstrap) {
    const holdingsValue = bootstrap.assetUniverse
        .filter((row) => row.holdingQty > 0)
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

export function normalizeTradeSide(value: unknown): "BUY" | "SELL" | null {
    const side = normalizeText(value).toUpperCase();
    if (side === "BUY" || side === "SELL")
        return side;
    return null;
}

export function normalizeReasonTags(value: unknown): string[] {
    return pickArray(value).map((item) => item.toLowerCase());
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
        logSwallowed("workbenchShared.correlationCheck", err);
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
  toIsoByMs,
  normalizeTimeZoneOrUtc,
  isPastUtcTime,
  getZonedYmd,
  isCalendarMonthDue,
  buildCalendarPeriodKey,
  nextCalendarDueDate,
  buildHfSignalMap,
  buildPreTradeRiskCheck,
  buildPreTradeRiskCheckFromBootstrap,
  enrichRiskCheckWithCorrelation,
  buildManualPreTradeRiskCheck,
  mapStoreCycleToView,
  buildMarketFacts,
  mapStoreCycleReportToView,
  buildTargetWeightsFromConfig,
  computeTotalEquity,
  priceAgeSec,
  buildWorkbenchMarketDataHealth,
  buildCycleDraftFromBootstrap,
  appendTriggerEventSafe,
  calcHoldingCostPerUnit,
  buildRiskCycleDraft,
  toCycleReportSnapshot,
};
