/**
 * 投资助理复核工作流 — Observe 节点（代码驱动，不调 LLM）
 */

import type { CognitiveState, CognitiveUpdate, PortfolioSnapshot, WatchlistSnapshot, MarketSnapshot, NewsSnapshot, NewsIntelligenceSnapshot } from "@/src/daa/agent/cognitiveState";
import { getDaaSystemConfig, getDaaAccountState } from "@/src/daa/store/accountStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { listDaaFxRates } from "@/src/daa/store/fxStore";
import { summarizeMarketSessionsForAssetKeys } from "@/src/daa/marketSession/marketSessionSnapshot";
import { buildAssetUniverseViewRows } from "@/src/daa/modules/workbench/assetUniverseService";
import {
  buildFxLookupToBase,
  summarizeMarkToMarketPortfolio,
} from "@/src/daa/modules/portfolio/portfolioValuation";
import { ensureAssetThesisCoverage, type BootstrapAsset } from "@/src/daa/agent/bootstrap";
import {
  listDaaDiscoveryCandidates,
  listDaaNewsEventsBySymbol,
  listDaaNewsItemsBySymbol,
  listLatestDaaMarketIndicatorSnapshots,
  listLatestDaaNewsEventGraphs,
  listLatestDaaNewsPortfolioImpacts,
} from "@/src/daa/store/marketCacheStore";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/** low conviction 判断超过该天数未有效复核则归档（持仓/观察列表资产除外） */
const LOW_CONVICTION_STALE_DAYS = 30;
/** 全局活跃投资判断上限；超限时从最弱、最陈旧的非持仓判断开始归档 */
const MAX_ACTIVE_THESES_GLOBAL = 60;

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
          memoryDecayRate: ca.memoryDecayRate,
          thesisStalenessDays: ca.thesisStalenessDays ?? 7,
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.config", e);
    }

    // Feature E: 经验记录衰减 — 在 cycle 开始时批量执行
    try {
      const decayRate = agentConfig?.memoryDecayRate ?? 0.97;
      await memoryStore.applyMemoryDecay(decayRate);
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.memoryDecay", e);
    }

    // 1. 组合数据 — 使用 buildAssetUniverseViewRows 以获得基准货币（USD）下的正确估值和权重。
    //    直接用 r.holdingQty * r.lastPrice 会把 HKD / CNY 等原币种金额当作 USD 相加，
    //    导致 HK 持仓被严重放大（例如 0388.HK 按 HKD 计算被当成 87.5% 的仓位）。
    const portfolio: PortfolioSnapshot = { holdings: [], totalEquity: 0, cashPct: 0 };
    const watchlist: WatchlistSnapshot = { candidates: [] };
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
      });
      const valuation = summarizeMarkToMarketPortfolio({
        positions: rawRows.map((row) => ({
          symbol: row.symbol,
          market: row.market,
          currency: row.currency,
          qty: row.holdingQty,
          holdingPrice: row.holdingPrice,
          lastPrice: row.lastPrice,
        })),
        baseCurrency,
        cash,
        fxLookup: buildFxLookupToBase(fxRates),
        accountTotalEquity: accountState.totalEquity,
      });
      const valuationByAssetKey = new Map(valuation.rows.map((row) => [row.assetKey, row]));
      const holdingRows = viewRows.filter(r => r.holdingQty > 0);
      const totalEquity = valuation.totalEquity;
      portfolio.holdings = holdingRows.map(r => ({
        assetKey: r.assetKey,
        symbol: r.symbol,
        holdingQty: r.holdingQty,
        lastPrice: r.lastPrice,
        valuationBase: valuationByAssetKey.get(r.assetKey)?.baseValue ?? null,
        weightPct: totalEquity > 0 ? (valuationByAssetKey.get(r.assetKey)?.baseValue ?? 0) / totalEquity : 0,
        unrealizedPnlPct: r.unrealizedPnlPct != null ? r.unrealizedPnlPct / 100 : null,
        targetWeightHint: r.targetWeightHint,
        gapPct: r.gapPct,
      }));
      portfolio.totalEquity = totalEquity;
      portfolio.cashPct = totalEquity > 0 ? valuation.cash / totalEquity : 0;
      watchlist.candidates = viewRows
        .filter(r => r.watchEnabled && r.holdingQty <= 0)
        .map(r => ({
          assetKey: r.assetKey,
          symbol: r.symbol,
          lastPrice: r.lastPrice > 0 ? r.lastPrice : r.holdingPrice,
          targetWeightPct: r.targetWeightPct,
          fxMissing: r.fxMissing,
          notes: r.notes,
          tags: r.watchTags,
        }));
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
        snapshots.map(s => [s.key, {
          value: s.rawValue,
          percentile: s.percentile252 ?? 50,
          stance: s.stance,
        }]),
      );
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.market", e);
    }

    const focusAssets: BootstrapAsset[] = [
      ...portfolio.holdings.map((h) => ({
        assetKey: h.assetKey,
        symbol: h.symbol,
        holdingQty: h.holdingQty,
        lastPrice: h.lastPrice,
        role: "holding" as const,
        tags: ["持仓"],
      })),
      ...watchlist.candidates.map((w) => ({
        assetKey: w.assetKey,
        symbol: w.symbol,
        holdingQty: 0,
        lastPrice: w.lastPrice,
        role: "watchlist" as const,
        notes: w.notes,
        tags: w.tags,
      })),
    ];
    const focusAssetKeys = Array.from(new Set(focusAssets.map((asset) => asset.assetKey).filter(Boolean)));
    market.sessions = summarizeMarketSessionsForAssetKeys({ assetKeys: focusAssetKeys });
    let thesisCoverageCreated = 0;
    try {
      const stalenessDays = agentConfig?.thesisStalenessDays ?? 7;
      const archivedIds = await thesisStore.archiveStaleUncertainTheses(stalenessDays, focusAssetKeys);
      if (archivedIds.length > 0) {
        logSwallowed("cognitiveGraph.observe.archiveStale", new Error(`archived ${archivedIds.length} stale non-focus uncertain theses`));
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.archiveStale", e);
    }
    // 投资判断 GC：low conviction 久未复核归档 + 全局活跃总量兜底（防止复核积压无限增长）
    try {
      const archivedLow = await thesisStore.archiveStaleLowConvictionTheses(LOW_CONVICTION_STALE_DAYS, focusAssetKeys);
      if (archivedLow.length > 0) {
        logSwallowed("cognitiveGraph.observe.archiveStaleLow", new Error(`archived ${archivedLow.length} stale non-focus low-conviction theses`));
      }
      const capped = await thesisStore.enforceActiveThesisCap(MAX_ACTIVE_THESES_GLOBAL, focusAssetKeys);
      if (capped.length > 0) {
        logSwallowed("cognitiveGraph.observe.thesisCap", new Error(`archived ${capped.length} theses over global cap ${MAX_ACTIVE_THESES_GLOBAL}`));
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.thesisGc", e);
    }
    try {
      const coverage = await ensureAssetThesisCoverage(focusAssets);
      thesisCoverageCreated = coverage.created;
      if (coverage.errors.length > 0) {
        logSwallowed("cognitiveGraph.observe.thesisCoverage", new Error(coverage.errors.slice(0, 3).join("; ")));
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.thesisCoverage", e);
    }

    const activeTheses = await thesisStore.getActiveTheses();

    // 3. 最近新闻（从 DB 缓存读取，不调外部 API）
    const news: NewsSnapshot = { items: [] };
    const focusSymbolsForNews = new Set((state.focusSymbols ?? []).map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean));
    const newsSymbols = Array.from(new Set([
      ...focusSymbolsForNews,
      ...portfolio.holdings.map(h => h.symbol.toUpperCase()),
      ...watchlist.candidates.map(w => w.symbol.toUpperCase()),
    ].filter(Boolean))).slice(0, 12);
    try {
      for (const sym of newsSymbols) {
        const events = await listDaaNewsEventsBySymbol({ symbol: sym, limit: 3 });
        if (events.length > 0) {
          for (const event of events) {
            news.items.push({
              symbol: sym,
              title: event.title,
              ts: event.publishedAt ?? event.analyzedAt,
              source: event.source,
              summary: event.llmSummary,
              actionHint: event.llmActionHint,
              scorePct: event.scorePct,
              confidencePct: event.confidencePct,
              majorEvent: event.llmMajorEvent,
            });
          }
          continue;
        }
        const items = await listDaaNewsItemsBySymbol({ symbol: sym, limit: 3 });
        for (const item of items) {
          news.items.push({
            symbol: sym,
            title: item.title ?? "",
            ts: item.publishedAt ?? item.fetchedAt ?? "",
            source: item.provider,
            summary: null,
            actionHint: null,
            scorePct: null,
            confidencePct: null,
            majorEvent: null,
          });
        }
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.news", e);
    }

    const newsIntelligence: NewsIntelligenceSnapshot = {
      eventGraphs: [],
      portfolioImpacts: [],
      discoveryCandidates: [],
    };
    try {
      const [eventGraphs, portfolioImpacts, discoveryCandidates] = await Promise.all([
        listLatestDaaNewsEventGraphs({ symbols: newsSymbols, limit: 20 }),
        listLatestDaaNewsPortfolioImpacts({ symbols: newsSymbols, limit: 20 }),
        listDaaDiscoveryCandidates({ statuses: ["new", "watching"], limit: 20 }),
      ]);
      newsIntelligence.eventGraphs = eventGraphs.map((graph) => ({
        symbol: graph.symbol,
        eventHash: graph.eventHash,
        themeKey: graph.themeKey,
        themeLabelZh: graph.themeLabelZh,
        eventScorePct: graph.eventScorePct,
        reasons: graph.reasons,
        relatedAssets: graph.relatedAssets.slice(0, 8).map((asset) => ({
          assetKey: asset.assetKey,
          symbol: asset.symbol,
          displayNameZh: asset.displayNameZh,
          relation: asset.relation,
          confidencePct: asset.confidencePct,
          reasonZh: asset.reasonZh,
        })),
      }));
      const focusedAssetKeys = new Set(focusAssetKeys.map((key) => key.toUpperCase()));
      newsIntelligence.portfolioImpacts = portfolioImpacts
        .filter((impact) => focusedAssetKeys.size === 0 || focusedAssetKeys.has(impact.assetKey.toUpperCase()) || impact.impactScope === "related_candidate")
        .map((impact) => ({
          assetKey: impact.assetKey,
          symbol: impact.symbol,
          eventHash: impact.eventHash,
          impactScope: impact.impactScope,
          impactLevel: impact.impactLevel,
          impactScorePct: impact.impactScorePct,
          recommendedAction: impact.recommendedAction,
          reasonZh: impact.reasonZh,
        }));
      newsIntelligence.discoveryCandidates = discoveryCandidates.map((candidate) => ({
        topicKey: candidate.topicKey,
        topicLabelZh: candidate.topicLabelZh,
        assetKey: candidate.assetKey,
        symbol: candidate.symbol,
        displayNameZh: candidate.displayNameZh,
        scorePct: candidate.scorePct,
        confidence: candidate.confidence,
        status: candidate.status,
        reasonZh: candidate.reasonZh,
      }));
    } catch (e) {
      logSwallowed("cognitiveGraph.observe.newsIntelligence", e);
    }

    return {
      agentConfig,
      portfolio,
      watchlist,
      market,
      news,
      newsIntelligence,
      activeTheses,
      toolsCalled: [{ tool: "observe", input: {}, outputSummary: `${activeTheses.length} theses, ${portfolio.holdings.length} holdings, ${watchlist.candidates.length} watchlist, ${news.items.length} news, ${newsIntelligence.portfolioImpacts.length} news impacts, ${newsIntelligence.discoveryCandidates.length} candidates, coverage+${thesisCoverageCreated}, regime=${market.regime}`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.observe", e);
    return { errors: [`observe: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
