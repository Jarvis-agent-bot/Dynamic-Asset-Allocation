import { buildDaaAssetKey } from "@/src/daa/assetKey";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import {
  upsertDaaDiscoveryCandidates,
  upsertDaaNewsEventGraphs,
  upsertDaaNewsPortfolioImpacts,
} from "@/src/daa/store/marketCacheStore";
import type {
  DaaStoreDiscoveryCandidate,
  DaaStoreDiscoveryCandidateConfidence,
  DaaStoreNewsEventGraph,
  DaaStoreNewsEventSnapshot,
  DaaStoreNewsImpactLevel,
  DaaStoreNewsImpactScope,
  DaaStoreNewsPortfolioImpact,
  DaaStoreNewsRecommendedAction,
  DaaStoreNewsRelatedAsset,
} from "@/src/daa/store/storeTypes";
import {
  WORKBENCH_FEATURED_ASSETS_CATALOG,
  type WorkbenchFeaturedCatalogItem,
} from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";

export type NewsIntelligenceEventInput = Pick<
  DaaStoreNewsEventSnapshot,
  | "provider"
  | "symbol"
  | "eventHash"
  | "itemHash"
  | "title"
  | "link"
  | "source"
  | "scorePct"
  | "confidencePct"
  | "llmSummary"
  | "llmDrivers"
  | "llmMajorEvent"
  | "llmActionHint"
  | "analyzedAt"
>;

export type NewsIntelligenceArtifacts = {
  eventGraphs: DaaStoreNewsEventGraph[];
  portfolioImpacts: DaaStoreNewsPortfolioImpact[];
  discoveryCandidates: DaaStoreDiscoveryCandidate[];
};

type NewsIntelligenceAssetRow = {
  assetKey: string;
  symbol: string;
  market: string;
  name: string | null;
  displayNameZh: string | null;
  holdingQty: number;
  watchEnabled: boolean;
  targetWeightHint: number;
  targetWeightPct: number;
  valuationBase?: number | null;
  lastPrice?: number | null;
  fxRateToBase?: number | null;
  actualWeightPct?: number | null;
};

type ThemeRule = {
  key: string;
  labelZh: string;
  keywords: string[];
};

const THEME_RULES: ThemeRule[] = [
  {
    key: "semiconductor",
    labelZh: "半导体",
    keywords: ["semiconductor", "chip", "chips", "gpu", "hbm", "memory", "dram", "nand", "asic", "foundry", "wafer", "data center", "datacenter", "ai server", "nvidia", "micron", "broadcom", "tsmc", "半导体", "芯片", "存储", "算力", "英伟达", "美光", "台积电"],
  },
  {
    key: "commodity_resource",
    labelZh: "商品/资源",
    keywords: ["gold", "silver", "oil", "commodity", "inflation", "safe haven", "precious metal", "黄金", "白银", "原油", "通胀", "避险", "商品"],
  },
  {
    key: "defensive_income",
    labelZh: "防守收益",
    keywords: ["treasury", "yield", "bond", "rate cut", "rate hike", "fed", "inflation print", "国债", "债券", "降息", "加息", "美联储", "收益率"],
  },
  {
    key: "core_equity",
    labelZh: "核心股票",
    keywords: ["s&p", "nasdaq", "equity market", "earnings season", "soft landing", "recession", "标普", "纳斯达克", "股市", "财报季", "衰退"],
  },
  {
    key: "global_region",
    labelZh: "全球区域",
    keywords: ["china", "hong kong", "emerging market", "japan", "korea", "europe", "中国", "香港", "新兴市场", "日本", "韩国", "欧洲"],
  },
  {
    key: "crypto",
    labelZh: "加密",
    keywords: ["bitcoin", "ethereum", "crypto", "etf approval", "比特币", "以太坊", "加密"],
  },
  {
    key: "cybersecurity",
    labelZh: "网络安全",
    keywords: ["cybersecurity", "breach", "ransomware", "hack", "网络安全", "数据泄露", "勒索"],
  },
  {
    key: "robotics",
    labelZh: "机器人/自动化",
    keywords: ["robot", "robotics", "automation", "humanoid", "机器人", "自动化", "人形机器人"],
  },
  {
    key: "currency_hedge",
    labelZh: "汇率对冲",
    keywords: ["dollar", "yen", "currency", "fx", "汇率", "美元", "日元", "外汇"],
  },
];

const FEATURED_ASSET_BY_SYMBOL: Map<string, WorkbenchFeaturedCatalogItem> = new Map(
  WORKBENCH_FEATURED_ASSETS_CATALOG.map((item) => [normalizeSymbol(item.symbol), item]),
);

function normalizeSymbol(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function assetKeyOfCatalogItem(item: WorkbenchFeaturedCatalogItem): string {
  return buildDaaAssetKey(item.symbol, item.market).toUpperCase();
}

function toRelatedAsset(
  item: WorkbenchFeaturedCatalogItem,
  relation: string,
  confidencePct: number,
  reasonZh: string,
): DaaStoreNewsRelatedAsset {
  return {
    assetKey: assetKeyOfCatalogItem(item),
    symbol: normalizeSymbol(item.symbol),
    market: normalizeSymbol(item.market),
    name: item.name,
    displayNameZh: item.displayNameZh,
    relation,
    confidencePct: Math.max(0, Math.min(100, confidencePct)),
    reasonZh,
  };
}

function buildUniverseLookups(assetUniverse: NewsIntelligenceAssetRow[]): {
  byAssetKey: Map<string, NewsIntelligenceAssetRow>;
  bySymbol: Map<string, NewsIntelligenceAssetRow>;
} {
  const byAssetKey = new Map<string, NewsIntelligenceAssetRow>();
  const bySymbol = new Map<string, NewsIntelligenceAssetRow>();
  for (const row of assetUniverse) {
    byAssetKey.set(row.assetKey.toUpperCase(), row);
    bySymbol.set(row.symbol.toUpperCase(), row);
  }
  return { byAssetKey, bySymbol };
}

function detectTheme(event: NewsIntelligenceEventInput): { key: string; labelZh: string; reasons: string[] } {
  const sourceSymbol = normalizeSymbol(event.symbol);
  const catalogItem = FEATURED_ASSET_BY_SYMBOL.get(sourceSymbol);
  const text = [
    event.symbol,
    event.title,
    event.llmSummary,
    event.llmActionHint,
    event.llmMajorEvent?.type,
    event.llmMajorEvent?.description,
    ...(event.llmDrivers?.bullish ?? []),
    ...(event.llmDrivers?.bearish ?? []),
  ].filter(Boolean).join(" ").toLowerCase();

  const matched = THEME_RULES.find((rule) => rule.key === catalogItem?.themeKey)
    ?? THEME_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())));

  if (matched) {
    return {
      key: matched.key,
      labelZh: matched.labelZh,
      reasons: [`新闻文本命中「${matched.labelZh}」主题`, catalogItem ? `${sourceSymbol} 属于该主题资产池` : ""].filter(Boolean),
    };
  }

  if (catalogItem) {
    return {
      key: catalogItem.themeKey,
      labelZh: catalogItem.themeLabelZh,
      reasons: [`${sourceSymbol} 属于「${catalogItem.themeLabelZh}」资产池`],
    };
  }

  const type = normalizeText(event.llmMajorEvent?.type, "other");
  return {
    key: `event_${type}`,
    labelZh: "综合事件",
    reasons: ["新闻未命中特定资产主题，按事件类型归档"],
  };
}

function inferRelatedAssets(input: {
  event: NewsIntelligenceEventInput;
  themeKey: string;
  themeLabelZh: string;
  assetUniverse: NewsIntelligenceAssetRow[];
}): DaaStoreNewsRelatedAsset[] {
  const sourceSymbol = normalizeSymbol(input.event.symbol);
  const out = new Map<string, DaaStoreNewsRelatedAsset>();
  const sourceCatalogItem = FEATURED_ASSET_BY_SYMBOL.get(sourceSymbol);
  if (sourceCatalogItem) {
    const source = toRelatedAsset(
      sourceCatalogItem,
      "source",
      100,
      "新闻直接提到的标的",
    );
    out.set(source.assetKey, source);
  }

  for (const item of WORKBENCH_FEATURED_ASSETS_CATALOG) {
    if (item.themeKey !== input.themeKey) continue;
    const related = toRelatedAsset(
      item,
      item.symbol.toUpperCase() === sourceSymbol ? "source" : "same_theme",
      item.symbol.toUpperCase() === sourceSymbol ? 100 : 72,
      item.symbol.toUpperCase() === sourceSymbol
        ? "新闻直接提到的标的"
        : `同属「${input.themeLabelZh}」主题，可作为横向验证资产`,
    );
    out.set(related.assetKey, related);
  }

  for (const row of input.assetUniverse) {
    if (row.symbol.toUpperCase() !== sourceSymbol) continue;
    const assetKey = row.assetKey.toUpperCase();
    if (out.has(assetKey)) continue;
    out.set(assetKey, {
      assetKey,
      symbol: row.symbol.toUpperCase(),
      market: row.market.toUpperCase(),
      name: row.name,
      displayNameZh: row.displayNameZh,
      relation: "source",
      confidencePct: 100,
      reasonZh: "新闻直接提到的当前组合资产",
    });
  }

  return [...out.values()]
    .sort((a, b) => b.confidencePct - a.confidencePct || a.assetKey.localeCompare(b.assetKey))
    .slice(0, 10);
}

function resolveImpactScope(row: NewsIntelligenceAssetRow | null): DaaStoreNewsImpactScope {
  if (!row) return "related_candidate";
  if (isVisibleHolding(row)) return "holding";
  if (row.targetWeightPct > 0) return "target";
  if (row.watchEnabled) return "watchlist";
  return "related_candidate";
}

function resolveImpactLevel(
  event: NewsIntelligenceEventInput,
  scope: DaaStoreNewsImpactScope,
): DaaStoreNewsImpactLevel {
  const impact = normalizeText(event.llmMajorEvent?.impact, "").toLowerCase();
  const scorePct = Math.max(toFiniteNumber(event.scorePct, 50), toFiniteNumber(event.confidencePct, 0));
  if (impact === "high") return scope === "holding" ? "risk" : "review";
  if (impact === "medium") return scope === "holding" || scope === "target" ? "review" : "watch";
  if (scorePct >= 72) return scope === "holding" ? "review" : "watch";
  if (scope === "holding") return "watch";
  return "none";
}

function resolveRecommendedAction(
  scope: DaaStoreNewsImpactScope,
  level: DaaStoreNewsImpactLevel,
): DaaStoreNewsRecommendedAction {
  if (scope === "related_candidate") return "candidate_watchlist";
  if (level === "risk" || level === "review") return "review_thesis";
  if (level === "watch") return "investigate";
  return "record";
}

function confidenceFromScore(scorePct: number): DaaStoreDiscoveryCandidateConfidence {
  if (scorePct >= 75) return "high";
  if (scorePct >= 55) return "medium";
  return "low";
}

function buildPortfolioImpacts(input: {
  event: NewsIntelligenceEventInput;
  graph: DaaStoreNewsEventGraph;
  assetUniverse: NewsIntelligenceAssetRow[];
}): DaaStoreNewsPortfolioImpact[] {
  const lookups = buildUniverseLookups(input.assetUniverse);
  const generatedAt = input.event.analyzedAt || new Date().toISOString();
  return input.graph.relatedAssets.flatMap((asset) => {
    const row = lookups.byAssetKey.get(asset.assetKey.toUpperCase())
      ?? lookups.bySymbol.get(asset.symbol.toUpperCase())
      ?? null;
    const scope = resolveImpactScope(row);
    const level = resolveImpactLevel(input.event, scope);
    if (level === "none") return [];
    const impactScorePct = Math.max(
      toFiniteNumber(input.event.scorePct, 50),
      toFiniteNumber(input.event.confidencePct, 0),
      asset.confidencePct,
    );
    const action = resolveRecommendedAction(scope, level);
    const assetLabel = asset.displayNameZh ? `${asset.displayNameZh} ${asset.symbol}` : asset.symbol;
    const eventDesc = input.event.llmMajorEvent?.description || input.event.llmSummary || input.event.title;
    return [{
      id: "",
      ownerAccountId: "",
      provider: input.event.provider,
      symbol: normalizeSymbol(input.event.symbol),
      eventHash: input.event.eventHash,
      assetKey: asset.assetKey,
      impactScope: scope,
      impactLevel: level,
      impactScorePct: Math.max(0, Math.min(100, impactScorePct)),
      recommendedAction: action,
      reasonZh: `${assetLabel} 与「${input.graph.themeLabelZh}」新闻相关：${eventDesc}`,
      generatedAt,
      updatedAt: generatedAt,
    }];
  });
}

function buildDiscoveryCandidates(input: {
  event: NewsIntelligenceEventInput;
  graph: DaaStoreNewsEventGraph;
  impacts: DaaStoreNewsPortfolioImpact[];
}): DaaStoreDiscoveryCandidate[] {
  const impactByAssetKey = new Map(input.impacts.map((impact) => [impact.assetKey.toUpperCase(), impact]));
  const generatedAt = input.event.analyzedAt || new Date().toISOString();
  return input.graph.relatedAssets.flatMap((asset) => {
    const impact = impactByAssetKey.get(asset.assetKey.toUpperCase());
    if (!impact || impact.impactScope !== "related_candidate") return [];
    if (impact.impactLevel === "none") return [];
    const scorePct = Math.max(impact.impactScorePct, asset.confidencePct);
    return [{
      id: "",
      ownerAccountId: "",
      topicKey: input.graph.themeKey,
      topicLabelZh: input.graph.themeLabelZh,
      assetKey: asset.assetKey,
      symbol: asset.symbol,
      market: asset.market,
      name: asset.name,
      displayNameZh: asset.displayNameZh,
      scorePct,
      confidence: confidenceFromScore(scorePct),
      status: "new",
      reasonZh: `${asset.displayNameZh || asset.symbol} 与「${input.graph.themeLabelZh}」事件相关，建议进入复核候选池；系统不会自动加入观察列表或交易。`,
      riskNotesZh: [
        "候选发现只代表复核线索，不代表买入信号。",
        "加入观察列表或建仓仍需经过人工确认与策略风控。",
      ],
      evidenceRefs: [
        `news:${input.event.provider}:${normalizeSymbol(input.event.symbol)}:${input.event.eventHash}`,
        input.event.link ? `url:${input.event.link}` : "",
        ].filter(Boolean),
        discoveredAt: generatedAt,
        lastSeenAt: generatedAt,
        seenCount: 1,
        reviewedAt: null,
        promotedAt: null,
        dismissedAt: null,
        archivedAt: null,
        statusUpdatedAt: generatedAt,
        updatedAt: generatedAt,
      }];
  });
}

export function buildNewsIntelligenceArtifacts(input: {
  events: NewsIntelligenceEventInput[];
  assetUniverse: NewsIntelligenceAssetRow[];
}): NewsIntelligenceArtifacts {
  const eventGraphs: DaaStoreNewsEventGraph[] = [];
  const portfolioImpacts: DaaStoreNewsPortfolioImpact[] = [];
  const discoveryCandidates: DaaStoreDiscoveryCandidate[] = [];

  for (const event of input.events) {
    const symbol = normalizeSymbol(event.symbol);
    const eventHash = normalizeText(event.eventHash);
    const title = normalizeText(event.title);
    if (!symbol || !eventHash || !title) continue;

    const theme = detectTheme(event);
    const relatedAssets = inferRelatedAssets({
      event,
      themeKey: theme.key,
      themeLabelZh: theme.labelZh,
      assetUniverse: input.assetUniverse,
    });
    const generatedAt = event.analyzedAt || new Date().toISOString();
    const graph: DaaStoreNewsEventGraph = {
      provider: normalizeText(event.provider, "multi"),
      symbol,
      eventHash,
      itemHash: normalizeText(event.itemHash),
      themeKey: theme.key,
      themeLabelZh: theme.labelZh,
      relatedAssets,
      eventScorePct: Math.max(toFiniteNumber(event.scorePct, 50), toFiniteNumber(event.confidencePct, 0)),
      reasons: theme.reasons,
      generatedAt,
      updatedAt: generatedAt,
    };
    eventGraphs.push(graph);

    const impacts = buildPortfolioImpacts({
      event,
      graph,
      assetUniverse: input.assetUniverse,
    });
    portfolioImpacts.push(...impacts);
    discoveryCandidates.push(...buildDiscoveryCandidates({ event, graph, impacts }));
  }

  return { eventGraphs, portfolioImpacts, discoveryCandidates };
}

export async function refreshNewsIntelligenceForEvents(events: NewsIntelligenceEventInput[]): Promise<NewsIntelligenceArtifacts> {
  if (events.length === 0) {
    return { eventGraphs: [], portfolioImpacts: [], discoveryCandidates: [] };
  }

  const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
  const artifacts = buildNewsIntelligenceArtifacts({ events, assetUniverse: bootstrap.assetUniverse });
  await Promise.all([
    upsertDaaNewsEventGraphs(artifacts.eventGraphs),
    upsertDaaNewsPortfolioImpacts(artifacts.portfolioImpacts),
    upsertDaaDiscoveryCandidates(artifacts.discoveryCandidates),
  ]);
  return artifacts;
}
