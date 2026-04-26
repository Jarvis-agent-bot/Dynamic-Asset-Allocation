/**
 * Cognitive Agent — Observe 节点（代码驱动，不调 LLM）
 */

import type { CognitiveState, CognitiveUpdate, PortfolioSnapshot, MarketSnapshot, NewsSnapshot } from "@/src/daa/agent/cognitiveState";
import { getDaaSystemConfig, getDaaAccountState } from "@/src/daa/store/accountStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { listDaaFxRates } from "@/src/daa/store/fxStore";
import { buildAssetUniverseViewRows } from "@/src/daa/modules/workbench/assetUniverseService";
import { listLatestDaaMarketIndicatorSnapshots, listDaaNewsItemsBySymbol } from "@/src/daa/store/marketCacheStore";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function observeNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    // Feature A: 从 DB 加载 Agent 配置
    let agentConfig: CognitiveState["agentConfig"] = null;
    try {
      const sysConfig = await getDaaSystemConfig();
      const ca = sysConfig.config.cognitiveAgent;
      if (ca) {
        agentConfig = {
          enabled: ca.enabled,
          maxInvestigationTargets: ca.maxInvestigationTargets,
          reviewIntervalDays: ca.reviewIntervalDays,
          memoryRecallLimit: ca.memoryRecallLimit,
          circuitBreakerThreshold: ca.circuitBreakerThreshold,
          schedule: ca.schedule,
          scheduleTimesUtc: ca.scheduleTimesUtc,
          memoryDecayRate: ca.memoryDecayRate,
          memoryArchiveThreshold: ca.memoryArchiveThreshold,
          thesisStalenessDays: ca.thesisStalenessDays ?? 7,
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.config", e);
    }

    // Feature E: 记忆衰减 — 在 cycle 开始时批量执行
    try {
      const decayRate = agentConfig?.memoryDecayRate ?? 0.97;
      await memoryStore.applyMemoryDecay(decayRate);
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.memoryDecay", e);
    }

    // P0-4: 归档超过 7 天未转正的调查型（uncertain）thesis，避免冲突/缺口噪声
    try {
      const archivedIds = await thesisStore.archiveStaleUncertainTheses(7);
      if (archivedIds.length > 0) {
        logSwallowed("cognitiveGraph.observe.archiveStale", new Error(`archived ${archivedIds.length} stale uncertain theses`));
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.archiveStale", e);
    }

    const activeTheses = await thesisStore.getActiveTheses();

    // 1. 组合数据 — 使用 buildAssetUniverseViewRows 以获得基准货币（USD）下的正确估值和权重。
    //    直接用 r.holdingQty * r.lastPrice 会把 HKD / CNY 等原币种金额当作 USD 相加，
    //    导致 HK 持仓被严重放大（例如 0388.HK 按 HKD 计算被当成 87.5% 的仓位）。
    const portfolio: PortfolioSnapshot = { holdings: [], totalEquity: 0, cashPct: 0 };
    try {
      const [accountState, rawRows, fxRates] = await Promise.all([
        getDaaAccountState(),
        listDaaAssetUniverse(),
        listDaaFxRates(),
      ]);
      const baseCurrency = normalizeDaaCurrencyCode(accountState.baseCurrency, "USD");
      const cash = Math.max(0, accountState.cash ?? 0);
      const viewRows = buildAssetUniverseViewRows({
        rows: rawRows,
        fxRates,
        baseCurrency,
        cash,
        targetWeights: {},
      });
      const holdingRows = viewRows.filter(r => r.holdingQty > 0);
      const holdingsValueBase = holdingRows.reduce((sum, r) => sum + Math.max(0, r.valuationBase ?? 0), 0);
      const totalEquity = holdingsValueBase + cash;
      portfolio.holdings = holdingRows.map(r => ({
        assetKey: r.assetKey,
        symbol: r.symbol,
        holdingQty: r.holdingQty,
        lastPrice: r.lastPrice,
        weightPct: totalEquity > 0 ? (r.valuationBase ?? 0) / totalEquity : 0,
        unrealizedPnlPct: r.unrealizedPnlPct != null ? r.unrealizedPnlPct / 100 : null,
      }));
      portfolio.totalEquity = totalEquity;
      portfolio.cashPct = totalEquity > 0 ? cash / totalEquity : 0;
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.portfolio", e);
    }

    // 2. 市场指标（从 DB 缓存读取）
    const market: MarketSnapshot = { regime: "unknown", vix: null, indicators: {} };
    try {
      const snapshots = await listLatestDaaMarketIndicatorSnapshots();
      const vixSnap = snapshots.find(s => s.key === "vix");
      market.vix = vixSnap?.rawValue ?? null;
      // 推导 regime：找到 riskOffScorePct 最高的 scope
      const riskOffScores = snapshots.map(s => s.riskOffScorePct).filter(v => v > 0);
      const avgRiskOff = riskOffScores.length > 0 ? riskOffScores.reduce((a, b) => a + b, 0) / riskOffScores.length : 50;
      market.regime = avgRiskOff > 65 ? "risk_off" : avgRiskOff < 40 ? "risk_on" : "transitional";
      market.indicators = Object.fromEntries(
        snapshots.slice(0, 10).map(s => [s.key, {
          value: s.rawValue,
          percentile: s.percentile252 ?? 50,
          stance: s.stance,
        }]),
      );
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.market", e);
    }

    // 3. 最近新闻（从 DB 缓存读取，不调外部 API）
    const news: NewsSnapshot = { items: [] };
    try {
      // 获取持仓资产的最近新闻
      const holdingSymbols = portfolio.holdings.slice(0, 10).map(h => h.symbol);
      for (const sym of holdingSymbols.slice(0, 5)) {
        const items = await listDaaNewsItemsBySymbol({ symbol: sym, limit: 3 });
        for (const item of items) {
          news.items.push({
            symbol: sym,
            title: item.title ?? "",
            ts: item.publishedAt ?? item.fetchedAt ?? "",
          });
        }
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.news", e);
    }

    return {
      agentConfig,
      portfolio,
      market,
      news,
      activeTheses,
      toolsCalled: [{ tool: "observe", input: {}, outputSummary: `${activeTheses.length} theses, ${portfolio.holdings.length} holdings, ${news.items.length} news, regime=${market.regime}`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.observe", e);
    return { errors: [`observe: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
