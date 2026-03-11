import { expect, test, type Page, type Route } from '@playwright/test';

type MockAsset = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  assetClass: string;
  region: string;
  exchange: string;
  instrumentType: string;
  marketGroup: string;
  yfinanceSymbol: string;
  holdingQty: number;
  holdingPrice: number;
  costBasis: number | null;
  holdingTags: string[];
  watchEnabled: boolean;
  targetWeightHint: number;
  watchTags: string[];
  notes: string | null;
  lastPrice: number;
  priceUpdatedAt: string | null;
  priceStatus: 'fresh' | 'stale' | 'missing' | 'unsupported';
  priceSource: string;
  priceAgeSec: number | null;
  valuationBase: number | null;
  fxRateToBase: number | null;
  fxMissing: boolean;
  actualWeightPct: number;
  targetWeightPct: number;
  gapPct: number | null;
  hfSignal: null;
};

type ApiErrorMock = {
  status?: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type MockState = {
  assets: MockAsset[];
  systemConfig: Record<string, any>;
  featuredGroups: Array<Record<string, any>>;
  cycles: Array<Record<string, any>>;
  tradeLogs: Array<Record<string, any>>;
};

type MockOptions = {
  insightFactory?: (asset: MockAsset, includeLlm: boolean) => Record<string, any>;
  previewHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  orderExecuteHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  generateCycleHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  patchCycleHandler?: (cycleId: string, payload: Record<string, any>, state: MockState) => Record<string, any>;
  executeSummaryHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  riskCheckHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  rebalanceExecuteHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  runHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  runError?: ApiErrorMock;
  writebackHandler?: (payload: Record<string, any>, state: MockState) => Record<string, any>;
  writebackError?: ApiErrorMock;
};

const NOW = '2026-03-11T08:00:00.000Z';
const DATE_SERIES = ['2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07'];

async function loginAsAdmin(page: Page, returnTo = '/daa/dashboard') {
  await page.goto(`/daa/login?returnTo=${encodeURIComponent(returnTo)}`);

  await expect(page.getByLabel('用户名')).toBeVisible();
  await page.getByLabel('用户名').fill('admin');
  await page.getByLabel('密码').fill('admin123');

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/daa/dashboard'), { timeout: 15_000 }),
    page.getByRole('button', { name: /登录系统/ }).click(),
  ]);

  await expect.poll(() => {
    const current = new URL(page.url());
    const value = `${current.pathname}${current.search}`;
    return value === returnTo || value.startsWith(`${returnTo}?`) || value.startsWith(`${returnTo}&`);
  }).toBeTruthy();

  await expect(page.getByRole('navigation', { name: 'DAA 主导航' })).toBeVisible();
}

function createAsset(input: Partial<MockAsset> & Pick<MockAsset, 'assetKey' | 'symbol' | 'market'>): MockAsset {
  const targetWeightHint = Math.max(0, Number(input.targetWeightHint ?? 0));
  const actualWeightPct = Number(input.actualWeightPct ?? 0);
  const price = Number(input.lastPrice ?? input.holdingPrice ?? 0);
  return {
    assetKey: input.assetKey,
    symbol: input.symbol,
    market: input.market,
    currency: input.currency ?? 'USD',
    assetClass: input.assetClass ?? 'EQUITY',
    region: input.region ?? input.market,
    exchange: input.exchange ?? 'NASDAQ',
    instrumentType: input.instrumentType ?? 'STOCK',
    marketGroup: input.marketGroup ?? `${input.market}_EQUITY`,
    yfinanceSymbol: input.yfinanceSymbol ?? input.symbol,
    holdingQty: Number(input.holdingQty ?? 0),
    holdingPrice: Number(input.holdingPrice ?? price),
    costBasis: input.costBasis ?? null,
    holdingTags: input.holdingTags ?? [],
    watchEnabled: input.watchEnabled ?? true,
    targetWeightHint,
    watchTags: input.watchTags ?? [],
    notes: input.notes ?? null,
    lastPrice: price,
    priceUpdatedAt: input.priceUpdatedAt ?? NOW,
    priceStatus: input.priceStatus ?? 'fresh',
    priceSource: input.priceSource ?? 'playwright-mock',
    priceAgeSec: input.priceAgeSec ?? 0,
    valuationBase: input.valuationBase ?? (price > 0 ? Number((price * Number(input.holdingQty ?? 0)).toFixed(2)) : 0),
    fxRateToBase: input.fxRateToBase ?? 1,
    fxMissing: input.fxMissing ?? false,
    actualWeightPct,
    targetWeightPct: Number((targetWeightHint * 100).toFixed(2)),
    gapPct: input.gapPct ?? Number((targetWeightHint * 100 - actualWeightPct).toFixed(2)),
    hfSignal: null,
  };
}

function featuredItemFromAsset(input: MockAsset & { name: string; thesisTagZh: string }): Record<string, any> {
  return {
    symbol: input.symbol,
    market: input.market,
    currency: input.currency,
    price: input.lastPrice,
    priceStatus: input.priceStatus,
    priceUpdatedAt: input.priceUpdatedAt,
    priceSource: input.priceSource,
    priceAgeSec: input.priceAgeSec,
    name: input.name,
    shortName: input.name,
    longName: input.name,
    exchange: input.exchange,
    exchangeDisp: input.exchange,
    quoteType: input.instrumentType,
    typeDisp: input.instrumentType,
    assetClass: input.assetClass,
    region: input.region,
    instrumentType: input.instrumentType,
    marketGroup: input.marketGroup,
    yfinanceSymbol: input.yfinanceSymbol,
    thesisTagZh: input.thesisTagZh,
  };
}

function baseSystemConfig(): Record<string, any> {
  return {
    strategy: {
      account: {
        baseCurrency: 'USD',
        cash: 120000,
        investableCash: 120000,
        frozenCash: 0,
        totalEquity: 120000,
      },
      constraints: {
        maxPositionPct: 0.35,
        minNotional: 200,
        maxOrderPctOfNav: 0.2,
      },
      execution: {
        feeRateBps: 5,
        slippageBps: 2,
      },
      policy: {
        minTradeNotional: 200,
      },
    },
    rebalanceStrategy: {
      calendar: { enabled: true, frequency: 'monthly', dayOfMonth: 1 },
      drift: { enabled: true, thresholdPct: 0.05, checkFrequency: 'daily' },
      cooldownHours: 24,
      analysisTimeUtc: '01:00',
      timezone: 'Asia/Shanghai',
      analysisFocus: '跨市场研究',
      autoGenerateEnabled: false,
      notifyEmailTo: '',
    },
    notification: {
      telegram: {
        enabled: true,
        onDriftTrigger: true,
      },
    },
  };
}

function createWorkbenchState(): MockState {
  const aapl = createAsset({
    assetKey: 'US::AAPL',
    symbol: 'AAPL',
    market: 'US',
    currency: 'USD',
    lastPrice: 185,
    holdingQty: 120,
    holdingPrice: 170,
    costBasis: 20400,
    actualWeightPct: 42,
    targetWeightHint: 0.32,
    valuationBase: 22200,
    watchEnabled: true,
  });
  const bnd = createAsset({
    assetKey: 'US::BND',
    symbol: 'BND',
    market: 'US',
    currency: 'USD',
    assetClass: 'BOND',
    instrumentType: 'ETF',
    marketGroup: 'US_BOND',
    lastPrice: 74,
    holdingQty: 320,
    holdingPrice: 72,
    costBasis: 23040,
    actualWeightPct: 25,
    targetWeightHint: 0.28,
    valuationBase: 23680,
    watchEnabled: true,
  });
  const gld = createAsset({
    assetKey: 'US::GLD',
    symbol: 'GLD',
    market: 'US',
    currency: 'USD',
    assetClass: 'COMMODITY',
    instrumentType: 'ETF',
    marketGroup: 'US_COMMODITY',
    lastPrice: 210,
    holdingQty: 0,
    holdingPrice: 0,
    actualWeightPct: 0,
    targetWeightHint: 0.12,
    valuationBase: 0,
    watchEnabled: true,
  });
  const tlt = createAsset({
    assetKey: 'US::TLT',
    symbol: 'TLT',
    market: 'US',
    currency: 'USD',
    assetClass: 'BOND',
    instrumentType: 'ETF',
    marketGroup: 'US_BOND',
    lastPrice: 95,
    holdingQty: 0,
    actualWeightPct: 0,
    targetWeightHint: 0,
    valuationBase: 0,
    watchEnabled: false,
  });

  return {
    assets: [aapl, bnd, gld, tlt],
    systemConfig: baseSystemConfig(),
    featuredGroups: [
      {
        market: 'US',
        marketLabelZh: '美股',
        items: [
          featuredItemFromAsset({ ...createAsset({ assetKey: 'US::QQQ', symbol: 'QQQ', market: 'US', lastPrice: 510, watchEnabled: false }), name: '纳指 ETF', thesisTagZh: '科技龙头' }),
          featuredItemFromAsset({ ...createAsset({ assetKey: 'US::GLD', symbol: 'GLD', market: 'US', lastPrice: 210, watchEnabled: false, assetClass: 'COMMODITY', instrumentType: 'ETF', marketGroup: 'US_COMMODITY' }), name: '黄金 ETF', thesisTagZh: '抗通胀对冲' }),
        ],
      },
    ],
    cycles: [],
    tradeLogs: [],
  };
}

function createCrossMarketState(): MockState {
  const state = createWorkbenchState();
  state.assets = [
    createAsset({
      assetKey: 'US::AAPL',
      symbol: 'AAPL',
      market: 'US',
      currency: 'USD',
      lastPrice: 185,
      holdingQty: 100,
      holdingPrice: 170,
      actualWeightPct: 35,
      targetWeightHint: 0.35,
      valuationBase: 18500,
      watchEnabled: true,
    }),
    createAsset({
      assetKey: 'US::BND',
      symbol: 'BND',
      market: 'US',
      currency: 'USD',
      assetClass: 'BOND',
      instrumentType: 'ETF',
      marketGroup: 'US_BOND',
      lastPrice: 74,
      holdingQty: 300,
      holdingPrice: 72,
      actualWeightPct: 30,
      targetWeightHint: 0.25,
      valuationBase: 22200,
      watchEnabled: true,
    }),
    createAsset({
      assetKey: 'HK::0700.HK',
      symbol: '0700.HK',
      market: 'HK',
      currency: 'HKD',
      exchange: 'HKEX',
      yfinanceSymbol: '0700.HK',
      lastPrice: 320,
      holdingQty: 80,
      holdingPrice: 300,
      actualWeightPct: 18,
      targetWeightHint: 0.2,
      valuationBase: 25600,
      fxRateToBase: 0.128,
      watchEnabled: true,
    }),
    createAsset({
      assetKey: 'CN::600519.SS',
      symbol: '600519.SS',
      market: 'CN',
      currency: 'CNY',
      exchange: 'SSE',
      yfinanceSymbol: '600519.SS',
      lastPrice: 1650,
      holdingQty: 12,
      holdingPrice: 1500,
      actualWeightPct: 17,
      targetWeightHint: 0.2,
      valuationBase: 19800,
      fxRateToBase: 0.138,
      watchEnabled: true,
    }),
  ];
  return state;
}

function createEmptyStrategyLabState(): MockState {
  return {
    assets: [],
    systemConfig: baseSystemConfig(),
    featuredGroups: [],
    cycles: [],
    tradeLogs: [],
  };
}

function buildRiskCheck(status: 'pass' | 'warn' | 'block', message = ''): Record<string, any> {
  if (status === 'pass') {
    return {
      overallStatus: 'pass',
      items: [
        { rule: 'max_position', status: 'pass', current: 0.22, limit: 0.35, message: '单仓上限正常。' },
      ],
    };
  }
  if (status === 'warn') {
    return {
      overallStatus: 'warn',
      items: [
        { rule: 'concentration', status: 'warn', current: 0.42, limit: 0.4, message: message || '组合集中度接近阈值，建议分步执行。' },
      ],
    };
  }
  return {
    overallStatus: 'block',
    items: [
      { rule: 'max_order_pct', status: 'block', current: 0.26, limit: 0.2, message: message || '单笔调仓金额超过 NAV 上限。' },
    ],
  };
}

function buildBootstrap(state: MockState): Record<string, any> {
  return {
    baseCurrency: 'USD',
    account: {
      cash: 120000,
      investableCash: 120000,
      frozenCash: 0,
      totalEquity: 120000,
    },
    assetUniverse: state.assets,
    execution: {
      logs: state.tradeLogs,
    },
    rebalance: {
      mode: 'manual',
      autoAnalysisEnabled: false,
      analysisTimeUtc: '01:00',
      timezone: 'Asia/Shanghai',
      emailTo: '',
      analysisFocus: '跨市场研究',
    },
    rebalanceStrategy: {
      calendar: { enabled: true, frequency: 'monthly', dayOfMonth: 1 },
      drift: { enabled: true, thresholdPct: 0.05, checkFrequency: 'daily' },
      cooldownHours: 24,
      analysisTimeUtc: '01:00',
      timezone: 'Asia/Shanghai',
      analysisFocus: '跨市场研究',
      autoGenerateEnabled: false,
      notifyEmailTo: '',
    },
    overviewAlerts: [],
    latestCycle: state.cycles[0] || null,
    warnings: [],
    marketContext: null,
  };
}

function buildWorkbenchReadModel(state: MockState): Record<string, any> {
  return {
    bootstrap: buildBootstrap(state),
    cycles: state.cycles,
    loadedAt: NOW,
  };
}

function buildStrategyLabSeedReadModel(state: MockState): Record<string, any> {
  return {
    bootstrap: buildBootstrap(state),
    baseCurrency: 'USD',
    initialEquity: 120000,
    constraints: {
      maxPositionPct: 0.35,
      minNotional: 200,
      maxOrderPctOfNav: 0.2,
    },
    policy: {
      thresholdPct: 0.05,
      minTradeNotional: 200,
      cooldownSeconds: 24 * 3600,
    },
    execution: {
      feeRateBps: 5,
      slippageBps: 2,
      maxOrderPctOfNav: 0.2,
    },
    availableAssets: state.assets,
    selectedAssetKeys: state.assets.filter((asset) => asset.watchEnabled || asset.holdingQty > 0).map((asset) => asset.assetKey),
    loadedAt: NOW,
  };
}

function buildInsight(asset: MockAsset, includeLlm: boolean): Record<string, any> {
  return {
    assetKey: asset.assetKey,
    symbol: asset.symbol,
    generatedAt: NOW,
    priceSnapshot: {
      price: asset.lastPrice,
      currency: asset.currency,
      priceStatus: asset.priceStatus,
      priceSource: asset.priceSource,
      priceUpdatedAt: asset.priceUpdatedAt,
      priceAgeSec: asset.priceAgeSec,
    },
    opportunity: {
      action: 'watch',
      actionLabelZh: '继续跟踪',
      finalScorePct: 68,
      confidencePct: 74,
      riskScorePct: 26,
      reasons: [`${asset.symbol} 相对趋势稳定。`],
      reasonZh: `${asset.symbol} 近期趋势与资金面保持稳定。`,
      riskZh: '波动处于可控区间。',
      scores: {
        human: 60,
        news: 66,
        technical: 72,
        valuation: 64,
        penalty: 8,
      },
    },
    technical: {
      scorePct: 72,
      confidencePct: 70,
      momentumRegime: 'trend_up',
      reasons: [`${asset.symbol} 站上中期均线。`],
      common: [
        { key: 'rsi', label: 'RSI', value: 58, status: 'bullish' },
      ],
      specific: [
        { key: 'ma50', label: 'MA50', value: asset.lastPrice * 0.96, status: 'bullish' },
      ],
    },
    news: {
      scorePct: 63,
      confidencePct: 65,
      evidenceCount: 2,
      reasons: [`${asset.symbol} 相关新闻偏中性偏多。`],
      items: [
        {
          title: `${asset.symbol} mock headline`,
          link: 'https://example.com/mock-news',
          ts: NOW,
          sourceCredibility: 0.8,
          sentimentScore: 0.25,
        },
      ],
      aiSummary: {
        summary: `${asset.symbol} 的新闻情绪整体温和偏正面。`,
        drivers: ['盈利预期稳定'],
        bullish: ['现金流改善'],
        bearish: ['估值不算便宜'],
        uncertainties: ['外部宏观扰动'],
        actions: ['继续跟踪成交量与趋势确认'],
      },
    },
    valuation: {
      scorePct: 61,
      confidencePct: 62,
      temperature: 'neutral',
      reasons: [`${asset.symbol} 估值接近历史中位。`],
      common: [
        { key: 'pe', label: 'PE', value: 18, status: 'neutral' },
      ],
      specific: [
        { key: 'ps', label: 'PS', value: 3.2, status: 'neutral' },
      ],
      relative: {
        key: 'pe_percentile',
        label: 'PE 百分位',
        value: 18,
        percentile: 52,
        trendPct: 0.01,
        status: 'neutral',
        description: '位于近三年中位附近。',
      },
    },
    marketContext: null,
    marketAttribution: null,
    llmAnalysis: includeLlm ? {
      status: 'ok',
      provider: 'mock',
      model: 'playwright',
      generatedAt: NOW,
      summary: `${asset.symbol} AI 总结：当前适合观察，不建议激进追价。`,
      opportunityNotes: ['趋势维持，等待回撤后的更优入场点。'],
      riskNotes: ['若波动突然抬升，需降低执行节奏。'],
      latencyMs: 42,
      marketRegime: null,
      marketFacts: ['市场风险偏好中性。'],
    } : null,
    riskHints: ['关注组合集中度变化。'],
  };
}

function buildPreview(asset: MockAsset, side: 'BUY' | 'SELL', overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  const qty = Number(overrides.qty ?? 1);
  const feeRateBps = Number(overrides.feeRateBps ?? 5);
  const grossNotional = Number((asset.lastPrice * qty).toFixed(2));
  const fee = Number((grossNotional * feeRateBps / 10000).toFixed(2));
  return {
    assetKey: asset.assetKey,
    symbol: asset.symbol,
    market: asset.market,
    currency: asset.currency,
    side,
    qty,
    price: asset.lastPrice,
    grossNotional,
    feeRateBps,
    fee,
    feeInBase: fee,
    fxRateToBase: asset.fxRateToBase,
    notionalInBase: grossNotional,
    baseCurrency: 'USD',
    accountCash: 120000,
    holdingQty: asset.holdingQty,
    canSubmit: true,
    riskCheck: buildRiskCheck('pass'),
    priceSource: asset.priceSource,
    priceSnapshotAt: asset.priceUpdatedAt,
    warnings: [],
    ...overrides,
  };
}

function buildTradeTicket(asset: MockAsset, side: 'BUY' | 'SELL', status: 'executed' | 'rejected', overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  const qty = Number(overrides.qty ?? 1);
  const price = Number(overrides.price ?? asset.lastPrice);
  const grossNotional = Number((qty * price).toFixed(2));
  return {
    ticketId: String(overrides.ticketId || `ticket-${asset.symbol}-${side.toLowerCase()}`),
    basketId: String(overrides.basketId || 'manual-basket'),
    assetKey: asset.assetKey,
    cycleId: overrides.cycleId ?? null,
    source: overrides.source || 'manual',
    status,
    symbol: asset.symbol,
    market: asset.market,
    instrumentCurrency: asset.currency,
    baseCurrency: 'USD',
    side,
    qty,
    price,
    fee: Number(overrides.fee ?? 1.2),
    grossNotional,
    fxRateToBase: asset.fxRateToBase,
    notionalInBase: Number(overrides.notionalInBase ?? grossNotional),
    decisionRefId: overrides.decisionRefId ?? null,
    reasonTags: overrides.reasonTags ?? [],
    reasonText: overrides.reasonText ?? 'playwright mock order',
    snapshotBefore: {},
    snapshotAfter: overrides.snapshotAfter ?? null,
    rejectCode: overrides.rejectCode ?? null,
    rejectMessage: overrides.rejectMessage ?? null,
    pricingMode: overrides.pricingMode ?? 'market',
    priceSource: overrides.priceSource ?? asset.priceSource,
    priceSnapshotAt: overrides.priceSnapshotAt ?? asset.priceUpdatedAt,
    createdBy: overrides.createdBy ?? 'playwright',
    createdAt: overrides.createdAt ?? NOW,
    executedAt: status === 'executed' ? NOW : null,
    canceledAt: null,
    updatedAt: NOW,
  };
}

function buildProposal(asset: MockAsset, side: 'BUY' | 'SELL', selected = true, overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    assetKey: asset.assetKey,
    symbol: asset.symbol,
    currency: asset.currency,
    fxRateToBase: asset.fxRateToBase,
    side,
    suggestedQty: Number(overrides.suggestedQty ?? (side === 'BUY' ? 12 : 8)),
    suggestedNotional: Number(overrides.suggestedNotional ?? (side === 'BUY' ? 2400 : 1800)),
    price: Number(overrides.price ?? asset.lastPrice),
    reason: overrides.reason ?? `${asset.symbol} 偏离目标权重，需要${side === 'BUY' ? '补仓' : '减仓'}。`,
    selected,
    hfContribution: overrides.hfContribution ?? '人因信号偏中性。',
    decisionContext: {
      driftReason: 'max drift exceeded',
      signalAction: side === 'BUY' ? 'open_or_add' : 'reduce_or_avoid',
      signalScore: 72,
      signalConfidence: 68,
      signalConflict: false,
      llmAdjustment: side === 'BUY' ? 'execute' : 'reduce_size',
      llmConfidence: 61,
      llmRationale: '结合市场状态控制执行节奏。',
      marketRegime: 'neutral',
      ruleBasedMarketRegime: 'neutral',
      llmMarketRegime: 'neutral',
      effectiveMarketRegime: 'neutral',
      marketScope: 'portfolio',
      marketScopeLabel: '组合摘要',
      marketIndicatorFlags: ['volatility_mid'],
      conflictFlags: [],
      finalQtyMultiplier: side === 'BUY' ? 0.9 : 0.85,
    },
    ...overrides,
  };
}

function buildCycle(input: {
  cycleId: string;
  status?: 'generated' | 'reviewing' | 'executing' | 'completed' | 'cancelled';
  proposals: Array<Record<string, any>>;
  riskCheck?: Record<string, any>;
  triggerSource?: 'manual' | 'drift' | 'risk' | 'calendar' | 'cash_idle';
  triggerReason?: string;
  executionSummary?: Record<string, any> | null;
  executedOrders?: string[];
}): Record<string, any> {
  return {
    cycleId: input.cycleId,
    status: input.status ?? 'generated',
    triggerSource: input.triggerSource ?? 'manual',
    triggerReason: input.triggerReason ?? '人工触发',
    snapshotAt: NOW,
    equitySnapshot: 120000,
    driftSnapshot: input.proposals.map((proposal) => ({
      assetKey: proposal.assetKey,
      symbol: proposal.symbol,
      actualPct: proposal.side === 'BUY' ? 0.18 : 0.34,
      targetPct: proposal.side === 'BUY' ? 0.24 : 0.26,
      driftPct: proposal.side === 'BUY' ? 0.06 : -0.08,
    })),
    proposals: input.proposals,
    riskCheck: input.riskCheck ?? buildRiskCheck('warn'),
    executedAt: input.status === 'completed' ? NOW : null,
    executedOrders: input.executedOrders ?? [],
    executionSummary: input.executionSummary ?? null,
    cancelledAt: input.status === 'cancelled' ? NOW : null,
    cancelReason: input.status === 'cancelled' ? '用户取消' : null,
    notes: null,
    marketContext: null,
    createdAt: NOW,
  };
}

function buildExecuteSummary(cycle: Record<string, any>, status: 'pass' | 'warn' | 'block'): Record<string, any> {
  return {
    cycleId: cycle.cycleId,
    executeMode: 'selected',
    orderCount: cycle.proposals.filter((item: Record<string, any>) => item.selected).length,
    buyNotional: cycle.proposals.filter((item: Record<string, any>) => item.selected && item.side === 'BUY').reduce((sum: number, item: Record<string, any>) => sum + item.suggestedNotional, 0),
    sellNotional: cycle.proposals.filter((item: Record<string, any>) => item.selected && item.side === 'SELL').reduce((sum: number, item: Record<string, any>) => sum + item.suggestedNotional, 0),
    estimatedFees: 14.5,
    netCashImpact: 620,
    topWeightChanges: cycle.proposals.slice(0, 2).map((item: Record<string, any>) => ({
      symbol: item.symbol,
      currentWeightPct: item.side === 'BUY' ? 18 : 34,
      projectedWeightPct: item.side === 'BUY' ? 22 : 28,
      changePct: item.side === 'BUY' ? 4 : -6,
    })),
    riskWarnings: status === 'warn' ? ['组合集中度接近阈值，建议分批执行。'] : status === 'block' ? ['当前建议将触发订单上限阻断。'] : [],
    riskOverallStatus: status,
  };
}

function normalizedTargetWeights(assets: MockAsset[]): Record<string, number> {
  const positiveAssets = assets.filter((asset) => asset.watchEnabled || asset.holdingQty > 0);
  const sum = positiveAssets.reduce((acc, asset) => acc + Math.max(0, asset.targetWeightHint), 0);
  if (sum > 0) {
    return Object.fromEntries(positiveAssets.map((asset) => [asset.assetKey, Number((asset.targetWeightHint / sum).toFixed(4))]));
  }
  const equal = positiveAssets.length > 0 ? Number((1 / positiveAssets.length).toFixed(4)) : 0;
  return Object.fromEntries(positiveAssets.map((asset) => [asset.assetKey, equal]));
}

function candidateWeightsForAssets(assets: MockAsset[], variant: 'default' | 'qqq'): Record<string, number> {
  const assetsUsed = assets.filter((asset) => asset.watchEnabled || asset.holdingQty > 0);
  if (assetsUsed.length <= 0) return {};
  const first = assetsUsed[0];
  const second = assetsUsed[1];
  const remaining = assetsUsed.slice(2);
  const base: Record<string, number> = {};
  if (variant === 'qqq') {
    if (first) base[first.assetKey] = 0.45;
    if (second) base[second.assetKey] = 0.2;
    const remainder = Math.max(0, 1 - Object.values(base).reduce((sum, value) => sum + value, 0));
    const each = remaining.length > 0 ? Number((remainder / remaining.length).toFixed(4)) : 0;
    for (const asset of remaining) base[asset.assetKey] = each;
  } else {
    if (first) base[first.assetKey] = 0.3;
    if (second) base[second.assetKey] = 0.25;
    const remainder = Math.max(0, 1 - Object.values(base).reduce((sum, value) => sum + value, 0));
    const each = remaining.length > 0 ? Number((remainder / remaining.length).toFixed(4)) : 0;
    for (const asset of remaining) base[asset.assetKey] = each;
  }
  return base;
}

function buildBacktest(input: {
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  rebalanceCount: number;
  turnoverNotional: number;
  totalFeesAbs: number;
  weightsBySymbol: Record<string, number>;
}): Record<string, any> {
  const initialEquity = 120000;
  const finalEquity = Number((initialEquity * (1 + input.totalReturn)).toFixed(2));
  return {
    schemaVersion: 1,
    dates: DATE_SERIES,
    equity: [initialEquity, initialEquity * 1.012, initialEquity * 1.026, finalEquity],
    dailyReturns: [0, 0.012, 0.014, Number((input.totalReturn - 0.026).toFixed(4))],
    metrics: {
      totalReturn: input.totalReturn,
      sharpe: input.sharpe,
      maxDrawdown: input.maxDrawdown,
      winRate: input.winRate,
    },
    summary: {
      initialEquityAbs: initialEquity,
      finalEquityAbs: finalEquity,
      rebalanceCount: input.rebalanceCount,
      turnoverNotional: input.turnoverNotional,
      totalFeesAbs: input.totalFeesAbs,
    },
    events: [
      {
        date: '2025-01-06',
        kind: 'rebalance',
        signalDate: '2025-01-03',
        executionTiming: 't_plus_1_close',
        trigger: {
          shouldRebalance: true,
          reason: '漂移超过阈值',
          stats: { maxAbsDriftPct: 0.08 },
        },
        orders: [],
        executed: [],
        turnoverNotional: input.turnoverNotional,
        feeNotional: input.totalFeesAbs,
      },
    ],
    warnings: [],
    states: {
      initial: {
        equityAbs: initialEquity,
        cashAbs: initialEquity,
        cashPct01: 1,
        weightsBySymbolPct01: {},
      },
      final: {
        equityAbs: finalEquity,
        cashAbs: 6000,
        cashPct01: 6000 / finalEquity,
        weightsBySymbolPct01: input.weightsBySymbol,
      },
    },
  };
}

function buildAttribution(input: {
  benchmarkSymbol: string;
  benchmarkReturn: number;
  totalReturn: number;
  assets: Array<{ symbol: string; weight: number }>;
  turnoverNotional: number;
  rebalanceCount: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
}): Record<string, any> {
  return {
    totalReturn: input.totalReturn,
    benchmark: { symbol: input.benchmarkSymbol, return: input.benchmarkReturn },
    activeReturn: Number((input.totalReturn - input.benchmarkReturn).toFixed(4)),
    perAsset: input.assets.map((asset, index) => ({
      symbol: asset.symbol,
      avgWeight: asset.weight,
      assetReturn: Number((0.04 + index * 0.015).toFixed(4)),
      contributionToReturn: Number((asset.weight * (0.04 + index * 0.015)).toFixed(4)),
      allocationEffect: Number((asset.weight * 0.01).toFixed(4)),
      selectionEffect: Number((asset.weight * 0.005).toFixed(4)),
    })),
    rebalanceEvents: Array.from({ length: Math.max(1, input.rebalanceCount) }).map((_, index) => ({
      date: DATE_SERIES[Math.min(index + 1, DATE_SERIES.length - 1)],
      turnover: Number((input.turnoverNotional / Math.max(1, input.rebalanceCount)).toFixed(2)),
      driftBefore: 0.05 + index * 0.01,
    })),
    metrics: {
      sharpe: input.sharpe,
      maxDrawdown: input.maxDrawdown,
      calmar: 1.25,
      volatility: 0.16,
      winRate: input.winRate,
    },
  };
}

function buildStrategyLabRunResult(state: MockState, payload: Record<string, any>, variant: 'default' | 'qqq'): Record<string, any> {
  const assetsUsed = state.assets.filter((asset) => asset.watchEnabled || asset.holdingQty > 0).map((asset) => ({
    assetKey: asset.assetKey,
    symbol: asset.symbol,
    market: asset.market,
    currency: asset.currency,
    label: asset.symbol,
    yfinanceSymbol: asset.yfinanceSymbol,
    currentWeightPct: Number((asset.actualWeightPct / 100).toFixed(4)),
    currentTargetWeightPct: Number(asset.targetWeightHint.toFixed(4)),
    holdingQty: asset.holdingQty,
    watchEnabled: asset.watchEnabled,
  }));
  const currentTargetWeights = normalizedTargetWeights(state.assets);
  const currentActualWeights = Object.fromEntries(assetsUsed.map((asset) => [asset.assetKey, Number(asset.currentWeightPct.toFixed(4))]));
  const benchmarkSymbol = String(payload.benchmarkSymbol || 'SPY').trim().toUpperCase() || 'SPY';
  const candidateWeights = candidateWeightsForAssets(state.assets, variant);
  const baselineWeights = currentTargetWeights;
  const candidateLabel = variant === 'qqq' ? '纳指增强候选' : '跨市场组合候选';
  const candidateReturn = variant === 'qqq' ? 0.096 : 0.082;
  const benchmarkReturn = variant === 'qqq' ? 0.041 : 0.028;
  const candidateSharpe = variant === 'qqq' ? 1.84 : 1.61;
  const candidateMdd = variant === 'qqq' ? 0.058 : 0.052;
  const candidateRebalanceCount = variant === 'qqq' ? 3 : 2;
  const candidateTurnover = variant === 'qqq' ? 18000 : 12400;
  const candidateAssets = assetsUsed.map((asset) => ({ symbol: asset.symbol, weight: Number(candidateWeights[asset.assetKey] || 0) }));
  const baselineAssets = assetsUsed.map((asset) => ({ symbol: asset.symbol, weight: Number(baselineWeights[asset.assetKey] || 0) }));

  const buildCandidate = (input: {
    id: string;
    label: string;
    score: number;
    weights: Record<string, number>;
    assets: Array<{ symbol: string; weight: number }>;
    totalReturn: number;
    benchmarkReturn: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    rebalanceCount: number;
    turnoverNotional: number;
    totalFeesAbs: number;
  }) => ({
    id: input.id,
    label: input.label,
    score: input.score,
    targetWeights: input.weights,
    targetWeightsByDate: Object.fromEntries(DATE_SERIES.map((date) => [date, input.weights])),
    averageTargetWeights: input.weights,
    backtest: buildBacktest({
      totalReturn: input.totalReturn,
      sharpe: input.sharpe,
      maxDrawdown: input.maxDrawdown,
      winRate: input.winRate,
      rebalanceCount: input.rebalanceCount,
      turnoverNotional: input.turnoverNotional,
      totalFeesAbs: input.totalFeesAbs,
      weightsBySymbol: Object.fromEntries(input.assets.map((asset) => [asset.symbol, asset.weight])),
    }),
    attribution: buildAttribution({
      benchmarkSymbol,
      benchmarkReturn: input.benchmarkReturn,
      totalReturn: input.totalReturn,
      assets: input.assets,
      turnoverNotional: input.turnoverNotional,
      rebalanceCount: input.rebalanceCount,
      maxDrawdown: input.maxDrawdown,
      sharpe: input.sharpe,
      winRate: input.winRate,
    }),
  });

  const bestCandidate = buildCandidate({
    id: 'ensemble',
    label: candidateLabel,
    score: variant === 'qqq' ? 94 : 90,
    weights: candidateWeights,
    assets: candidateAssets,
    totalReturn: candidateReturn,
    benchmarkReturn,
    sharpe: candidateSharpe,
    maxDrawdown: candidateMdd,
    winRate: 0.75,
    rebalanceCount: candidateRebalanceCount,
    turnoverNotional: candidateTurnover,
    totalFeesAbs: 120,
  });
  const baseline = buildCandidate({
    id: 'baseline',
    label: '当前配置',
    score: 79,
    weights: baselineWeights,
    assets: baselineAssets,
    totalReturn: 0.047,
    benchmarkReturn,
    sharpe: 1.12,
    maxDrawdown: 0.046,
    winRate: 0.58,
    rebalanceCount: 1,
    turnoverNotional: 4200,
    totalFeesAbs: 40,
  });

  const scenarios = [
    {
      scenarioId: 'ideal',
      label: '理想回测',
      description: '不考虑成交门槛与费用时的理论结果。',
      assumptions: ['忽略最小成交额限制'],
      constraints: {
        maxPositionPct: Number(payload.constraints?.maxPositionPct ?? 0.35),
        minNotional: Number(payload.constraints?.minNotional ?? 200),
        maxOrderPctOfNav: Number(payload.constraints?.maxOrderPctOfNav ?? 0.2),
      },
      policy: {
        thresholdPct: Number(payload.policy?.thresholdPct ?? 0.05),
        minTradeNotional: Number(payload.policy?.minTradeNotional ?? 200),
        cooldownSeconds: Number(payload.policy?.cooldownSeconds ?? 86400),
      },
      execution: {
        timing: 't_plus_1_close',
        feeRateBps: 0,
        slippageBps: 0,
      },
      candidates: [bestCandidate, baseline],
      bestCandidateId: 'ensemble',
      warnings: [],
    },
    {
      scenarioId: 'executable',
      label: '可执行回测',
      description: '计入执行摩擦后的实际可落地结果。',
      assumptions: ['考虑费用与最小成交额'],
      constraints: {
        maxPositionPct: Number(payload.constraints?.maxPositionPct ?? 0.35),
        minNotional: Number(payload.constraints?.minNotional ?? 200),
        maxOrderPctOfNav: Number(payload.constraints?.maxOrderPctOfNav ?? 0.2),
      },
      policy: {
        thresholdPct: Number(payload.policy?.thresholdPct ?? 0.05),
        minTradeNotional: Number(payload.policy?.minTradeNotional ?? 200),
        cooldownSeconds: Number(payload.policy?.cooldownSeconds ?? 86400),
      },
      execution: {
        timing: 't_plus_1_close',
        feeRateBps: Number(payload.execution?.feeRateBps ?? 5),
        slippageBps: Number(payload.execution?.slippageBps ?? 2),
      },
      candidates: [bestCandidate, baseline],
      bestCandidateId: 'ensemble',
      warnings: variant === 'qqq' ? ['warning: min order size: BUY HK::0700.HK rounded below minimum'] : [],
    },
  ];

  return {
    generatedAt: NOW,
    benchmark: {
      symbol: benchmarkSymbol,
      dates: DATE_SERIES,
      equity: [120000, 121200, 122500, Number((120000 * (1 + benchmarkReturn)).toFixed(2))],
      totalReturn: benchmarkReturn,
    },
    baseCurrency: 'USD',
    lookbackBars: Number(payload.lookbackBars ?? 252),
    assetsUsed,
    diagnostics: {
      mode: payload.alignmentMode ?? 'intersection',
      minBars: Number(payload.minBars ?? 252),
      inputSymbolCount: assetsUsed.length,
      outputSymbolCount: assetsUsed.length,
      unionDateCount: DATE_SERIES.length,
      commonDateCount: DATE_SERIES.length,
      startDate: String(payload.startDate || '2025-01-02'),
      endDate: String(payload.endDate || '2025-01-07'),
      droppedSymbols: [],
      barsBySymbol: Object.fromEntries(assetsUsed.map((asset) => [asset.symbol, { raw: 260, cleaned: 258, aligned: 252, ffillCount: 0 }])),
    },
    currentTargetWeights,
    currentActualWeights,
    scenarios,
    candidateComparisons: [
      {
        candidateId: 'ensemble',
        idealRank: 1,
        executableRank: 1,
        rankDelta: 0,
        executionGap: variant === 'qqq' ? 0.021 : 0.013,
        sharpeGap: 0.05,
        turnoverDelta: 1200,
        rebalanceDelta: 1,
        sourceBreakdown: [
          { sourceId: 'fee', label: '费用', description: '费用拖累收益。', returnImpact: 0.008, sharpeImpact: 0.02, turnoverDelta: 0, rebalanceDelta: 0 },
        ],
      },
      {
        candidateId: 'baseline',
        idealRank: 2,
        executableRank: 2,
        rankDelta: 0,
        executionGap: 0.008,
        sharpeGap: 0.02,
        turnoverDelta: 400,
        rebalanceDelta: 0,
        sourceBreakdown: [
          { sourceId: 'slippage', label: '滑点', description: '滑点带来轻微损耗。', returnImpact: 0.003, sharpeImpact: 0.01, turnoverDelta: 0, rebalanceDelta: 0 },
        ],
      },
    ],
    defaultScenarioId: 'executable',
    candidates: [bestCandidate, baseline],
    bestCandidateId: 'ensemble',
    warnings: variant === 'qqq' ? ['warning: min order size: BUY HK::0700.HK rounded below minimum'] : [],
  };
}

function findAsset(state: MockState, assetKey: string): MockAsset {
  const row = state.assets.find((asset) => asset.assetKey === assetKey);
  if (!row) {
    throw new Error(`asset not found: ${assetKey}`);
  }
  return row;
}

function upsertAsset(state: MockState, payload: Record<string, any>): MockAsset {
  const market = String(payload.market || '').trim().toUpperCase();
  const symbol = String(payload.symbol || '').trim().toUpperCase();
  const assetKey = `${market}::${symbol}`;
  const nextAsset = createAsset({
    assetKey,
    symbol,
    market,
    currency: String(payload.currency || 'USD').trim().toUpperCase(),
    assetClass: String(payload.assetClass || 'EQUITY').trim().toUpperCase(),
    region: String(payload.region || market).trim().toUpperCase(),
    exchange: String(payload.exchange || 'NASDAQ').trim().toUpperCase(),
    instrumentType: String(payload.instrumentType || 'STOCK').trim().toUpperCase(),
    marketGroup: String(payload.marketGroup || `${market}_EQUITY`).trim().toUpperCase(),
    watchEnabled: payload.watchEnabled !== false,
    targetWeightHint: Math.max(0, Number(payload.targetWeightHint || 0)),
    lastPrice: Number(payload.lastPrice || 0),
    fxRateToBase: market === 'HK' ? 0.128 : market === 'CN' ? 0.138 : 1,
  });
  const index = state.assets.findIndex((asset) => asset.assetKey === assetKey);
  if (index >= 0) state.assets[index] = nextAsset;
  else state.assets.push(nextAsset);
  return nextAsset;
}

function patchAsset(state: MockState, assetKey: string, payload: Record<string, any>): MockAsset {
  const current = findAsset(state, assetKey);
  const next = createAsset({
    ...current,
    watchEnabled: payload.watchEnabled ?? current.watchEnabled,
    watchTags: Array.isArray(payload.watchTags) ? payload.watchTags : current.watchTags,
    targetWeightHint: payload.targetWeightHint ?? current.targetWeightHint,
    holdingQty: payload.holdingQty ?? current.holdingQty,
    holdingPrice: payload.holdingPrice ?? current.holdingPrice,
    costBasis: payload.costBasis ?? current.costBasis,
    notes: payload.notes ?? current.notes,
    assetClass: payload.assetClass ?? current.assetClass,
    region: payload.region ?? current.region,
    exchange: payload.exchange ?? current.exchange,
    instrumentType: payload.instrumentType ?? current.instrumentType,
    marketGroup: payload.marketGroup ?? current.marketGroup,
    lastPrice: payload.lastPrice ?? current.lastPrice,
  });
  state.assets = state.assets.map((asset) => asset.assetKey === assetKey ? next : asset);
  return next;
}

async function fulfillJson(route: Route, body: Record<string, any>, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function fulfillApiError(route: Route, error: ApiErrorMock) {
  await fulfillJson(route, {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  }, error.status ?? 400);
}

async function mockDaaApis(page: Page, state: MockState, options: MockOptions = {}) {
  await page.route('**/api/daa/read/workbench*', async (route) => {
    await fulfillJson(route, { ok: true, data: buildWorkbenchReadModel(state) });
  });

  await page.route('**/api/daa/workbench/featured-assets*', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: {
        groups: state.featuredGroups,
        generatedAt: NOW,
      },
    });
  });

  await page.route('**/api/daa/workbench/assets/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const encodedAssetKey = pathname.split('/assets/')[1] || '';
    const row = patchAsset(state, decodeURIComponent(encodedAssetKey), JSON.parse(route.request().postData() || '{}'));
    await fulfillJson(route, { ok: true, data: { row } });
  });

  await page.route('**/api/daa/workbench/assets/*/insights*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const encodedAssetKey = pathname.split('/assets/')[1]?.split('/insights')[0] || '';
    const asset = findAsset(state, decodeURIComponent(encodedAssetKey));
    const includeLlm = new URL(route.request().url()).searchParams.get('includeLlm') === '1';
    const data = options.insightFactory ? options.insightFactory(asset, includeLlm) : buildInsight(asset, true);
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/assets/upsert', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const row = upsertAsset(state, payload);
    await fulfillJson(route, { ok: true, data: { row } });
  });

  await page.route('**/api/daa/workbench/execution/preview', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const asset = findAsset(state, String(payload.assetKey || ''));
    const data = options.previewHandler ? options.previewHandler(payload, state) : buildPreview(asset, String(payload.side || 'BUY') as 'BUY' | 'SELL');
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/execution/execute', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const asset = findAsset(state, String(payload.assetKey || ''));
    const data = options.orderExecuteHandler ? options.orderExecuteHandler(payload, state) : {
      item: buildTradeTicket(asset, String(payload.side || 'BUY') as 'BUY' | 'SELL', 'executed'),
      result: {
        ticketId: `ticket-${asset.symbol}`,
        status: 'executed',
      },
      summary: {
        executed: 1,
        rejected: 0,
        total: 1,
      },
      logs: [buildTradeTicket(asset, String(payload.side || 'BUY') as 'BUY' | 'SELL', 'executed')],
    };
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/rebalance/generate', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const data = options.generateCycleHandler ? options.generateCycleHandler(payload, state) : (() => {
      const cycle = buildCycle({
        cycleId: 'cycle-default',
        proposals: [
          buildProposal(findAsset(state, 'US::AAPL'), 'BUY', true),
          buildProposal(findAsset(state, 'US::BND'), 'SELL', true),
        ],
        riskCheck: buildRiskCheck('warn'),
      });
      state.cycles = [cycle];
      return {
        cycle,
        created: true,
        skippedByCooldown: false,
        cooldownUntil: null,
        message: '已生成 2 条再平衡建议。',
        portfolioStatus: 'needs_rebalance',
        marketRegime: 'neutral',
        llmSummary: '建议分两步执行。',
      };
    })();
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/rebalance/cycles/*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const cycleId = decodeURIComponent(pathname.split('/cycles/')[1] || '');
    const payload = JSON.parse(route.request().postData() || '{}');
    const data = options.patchCycleHandler ? options.patchCycleHandler(cycleId, payload, state) : (() => {
      const current = state.cycles.find((cycle) => cycle.cycleId === cycleId);
      if (!current) throw new Error(`cycle not found: ${cycleId}`);
      const next = {
        ...current,
        proposals: current.proposals.map((proposal: Record<string, any>) => {
          const selectedAssetSideKeys = Array.isArray(payload.selectedAssetSideKeys) ? payload.selectedAssetSideKeys.map(String) : [];
          const proposalKey = `${proposal.assetKey}::${proposal.side}`;
          return {
            ...proposal,
            selected: selectedAssetSideKeys.includes(proposalKey),
          };
        }),
        status: payload.cancel ? 'cancelled' : current.status,
        cancelledAt: payload.cancel ? NOW : current.cancelledAt,
        cancelReason: payload.cancel?.reason || current.cancelReason,
      };
      state.cycles = state.cycles.map((cycle) => cycle.cycleId === cycleId ? next : cycle);
      return next;
    })();
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/rebalance/execute-summary', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const data = options.executeSummaryHandler ? options.executeSummaryHandler(payload, state) : (() => {
      const cycle = state.cycles.find((item) => item.cycleId === payload.cycleId) || state.cycles[0];
      return buildExecuteSummary(cycle, 'warn');
    })();
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/risk-check', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const data = options.riskCheckHandler ? options.riskCheckHandler(payload, state) : buildRiskCheck('pass');
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/workbench/rebalance/execute', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const data = options.rebalanceExecuteHandler ? options.rebalanceExecuteHandler(payload, state) : (() => {
      const current = state.cycles.find((cycle) => cycle.cycleId === payload.cycleId) || state.cycles[0];
      const nextCycle = {
        ...current,
        status: 'completed',
        executedAt: NOW,
        executionSummary: {
          ordersExecuted: 2,
          ordersFailed: 0,
          totalNotional: current.proposals.reduce((sum: number, proposal: Record<string, any>) => sum + proposal.suggestedNotional, 0),
          newMaxDriftPct: 0.03,
        },
        executedOrders: current.proposals.map((proposal: Record<string, any>, index: number) => `cycle-ticket-${index}`),
      };
      state.cycles = state.cycles.map((cycle) => cycle.cycleId === nextCycle.cycleId ? nextCycle : cycle);
      return {
        cycle: nextCycle,
        logs: nextCycle.proposals.map((proposal: Record<string, any>, index: number) => buildTradeTicket(findAsset(state, proposal.assetKey), proposal.side, 'executed', { ticketId: `cycle-ticket-${index}`, cycleId: nextCycle.cycleId, source: 'decision' })),
      };
    })();
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/read/strategy-lab-seed', async (route) => {
    await fulfillJson(route, { ok: true, data: buildStrategyLabSeedReadModel(state) });
  });

  await page.route('**/api/daa/strategy-lab/run', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    if (options.runError) {
      await fulfillApiError(route, options.runError);
      return;
    }
    const data = options.runHandler ? options.runHandler(payload, state) : buildStrategyLabRunResult(state, payload, 'default');
    await fulfillJson(route, { ok: true, data });
  });

  await page.route('**/api/daa/strategy-lab/writeback', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    if (options.writebackError) {
      await fulfillApiError(route, options.writebackError);
      return;
    }
    const data = options.writebackHandler ? options.writebackHandler(payload, state) : (() => {
      const scopeAssetKeys = Array.isArray(payload.scopeAssetKeys) ? payload.scopeAssetKeys.map(String) : [];
      const weightsByAssetKey = payload.weightsByAssetKey && typeof payload.weightsByAssetKey === 'object'
        ? payload.weightsByAssetKey as Record<string, number>
        : {};
      state.assets = state.assets.map((asset) => {
        if (!scopeAssetKeys.includes(asset.assetKey)) return asset;
        const nextWeight = Math.max(0, Number(weightsByAssetKey[asset.assetKey] || 0));
        return createAsset({
          ...asset,
          targetWeightHint: nextWeight,
          targetWeightPct: nextWeight * 100,
          gapPct: nextWeight * 100 - asset.actualWeightPct,
        });
      });
      return {
        candidateId: String(payload.candidateId || 'ensemble'),
        updatedAssetKeys: scopeAssetKeys,
        updatedCount: scopeAssetKeys.length,
        clearedConfigTargetWeights: true,
        wroteAt: NOW,
      };
    })();
    await fulfillJson(route, { ok: true, data });
  });
}

async function expandInsightForSymbol(page: Page, symbol: string) {
  const row = page.locator('tr').filter({ has: page.getByText(symbol, { exact: true }) }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '更多' }).click();
  await page.getByText(/展开详情|收起详情/).first().click();
}

test('工作台支持多资产观察、洞察与手动风控阻断分支', async ({ page }) => {
  const state = createWorkbenchState();

  await mockDaaApis(page, state, {
    previewHandler: (payload) => {
      const asset = findAsset(state, String(payload.assetKey || ''));
      return buildPreview(asset, String(payload.side || 'BUY') as 'BUY' | 'SELL', {
        qty: 1,
        canSubmit: false,
        riskCheck: buildRiskCheck('block', '当前交易将被风控阻断：单笔调仓金额超过 NAV 上限。'),
        warnings: ['当前交易将被风控阻断：单笔调仓金额超过 NAV 上限。'],
      });
    },
  });
  await loginAsAdmin(page, '/daa/dashboard/workbench?tab=watchlist');

  await expect(page.getByRole('button', { name: /^观察列表/ })).toBeVisible();
  await expect(page.getByText('AAPL', { exact: true })).toBeVisible();
  await expect(page.getByText('BND', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="workbench-target-"]').nth(2)).toBeVisible();

  await expandInsightForSymbol(page, 'AAPL');
  await expect(page.getByRole('tab', { name: 'AI 解读' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'AI 解读' }).first().click();
  await expect(page.getByText('AAPL AI 总结：当前适合观察，不建议激进追价。')).toBeVisible();

  await expandInsightForSymbol(page, 'BND');
  await expect(page.getByText('BND', { exact: true })).toBeVisible();
  await expect(page.getByText('暂无 AI 解读')).toHaveCount(0);

  await page.getByTestId('workbench-target-US::BND').fill('15');
  await page.getByTestId('workbench-target-save-US::BND').click();
  await expect(page.getByText('BND 目标权重已更新为 15.00%')).toBeVisible();

  await page.getByTestId('workbench-buy-US::AAPL').click();
  await expect(page.getByText('市价买入')).toBeVisible();
  await page.getByPlaceholder('例如 1000').fill('1000');
  await page.getByRole('button', { name: '生成预览' }).click();
  await expect(page.getByText('Preview Ledger')).toBeVisible();
  await expect(page.getByText('当前交易将被风控阻断：单笔调仓金额超过 NAV 上限。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认执行' })).toBeDisabled();
});

test('工作台再平衡执行支持部分成功回执', async ({ page }) => {
  const state = createWorkbenchState();
  const generatedCycle = buildCycle({
    cycleId: 'cycle-partial',
    proposals: [
      buildProposal(findAsset(state, 'US::AAPL'), 'BUY', true, { suggestedNotional: 3200 }),
      buildProposal(findAsset(state, 'US::BND'), 'SELL', true, { suggestedNotional: 1800 }),
    ],
    riskCheck: buildRiskCheck('warn'),
  });

  await mockDaaApis(page, state, {
    generateCycleHandler: () => {
      state.cycles = [generatedCycle];
      return {
        cycle: generatedCycle,
        created: true,
        skippedByCooldown: false,
        cooldownUntil: null,
        message: '已生成 2 条再平衡建议。',
        portfolioStatus: 'needs_rebalance',
        marketRegime: 'neutral',
        llmSummary: '建议按优先级分批执行。',
      };
    },
    executeSummaryHandler: () => buildExecuteSummary(generatedCycle, 'warn'),
    riskCheckHandler: () => buildRiskCheck('pass'),
    rebalanceExecuteHandler: () => {
      const nextCycle = {
        ...generatedCycle,
        status: 'completed',
        executedAt: NOW,
        executedOrders: ['cycle-partial-1', 'cycle-partial-2'],
        executionSummary: {
          ordersExecuted: 1,
          ordersFailed: 1,
          totalNotional: 5000,
          newMaxDriftPct: 0.031,
        },
      };
      state.cycles = [nextCycle];
      return {
        cycle: nextCycle,
        logs: [
          buildTradeTicket(findAsset(state, 'US::AAPL'), 'BUY', 'executed', { ticketId: 'cycle-partial-1', cycleId: nextCycle.cycleId, source: 'decision' }),
          buildTradeTicket(findAsset(state, 'US::BND'), 'SELL', 'rejected', { ticketId: 'cycle-partial-2', cycleId: nextCycle.cycleId, source: 'decision', rejectCode: 'RISK_REVIEW', rejectMessage: '卖出数量被执行层拒绝。' }),
        ],
      };
    },
  });
  await loginAsAdmin(page, '/daa/dashboard/workbench?tab=rebalance');

  await page.getByRole('button', { name: '生成/刷新建议' }).first().click();
  await expect(page.getByText('AAPL', { exact: true })).toBeVisible();
  await expect(page.getByText('BND', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '一键全选' })).toBeVisible();

  await page.getByRole('button', { name: '清空勾选' }).click();
  await expect(page.getByText('未勾选').first()).toBeVisible();
  await page.getByRole('button', { name: '一键全选' }).click();
  await expect(page.getByText('已纳入执行').first()).toBeVisible();

  await page.getByRole('button', { name: /执行选中/ }).first().click();
  await expect(page.getByText('确认执行再平衡')).toBeVisible();
  await expect(page.getByText('组合集中度接近阈值，建议分批执行。')).toBeVisible();
  await page.getByRole('button', { name: '确认执行' }).click();

  await expect(page.getByText('部分执行成功', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('成功 1 笔 · 失败 1 笔')).toBeVisible();
  await expect(page.getByText('部分执行成功：成功 1 笔，失败 1 笔。')).toBeVisible();
});

test('工作台再平衡在执行前风控阻断时会给出明确提示', async ({ page }) => {
  const state = createWorkbenchState();
  const generatedCycle = buildCycle({
    cycleId: 'cycle-blocked',
    proposals: [
      buildProposal(findAsset(state, 'US::AAPL'), 'BUY', true, { suggestedNotional: 4000 }),
      buildProposal(findAsset(state, 'US::GLD'), 'BUY', true, { suggestedNotional: 2600 }),
    ],
    riskCheck: buildRiskCheck('warn'),
  });

  await mockDaaApis(page, state, {
    generateCycleHandler: () => {
      state.cycles = [generatedCycle];
      return {
        cycle: generatedCycle,
        created: true,
        skippedByCooldown: false,
        cooldownUntil: null,
        message: '已生成 2 条再平衡建议。',
        portfolioStatus: 'needs_rebalance',
        marketRegime: 'neutral',
        llmSummary: '需先通过最终风控。',
      };
    },
    executeSummaryHandler: () => buildExecuteSummary(generatedCycle, 'warn'),
    riskCheckHandler: () => buildRiskCheck('block', '组合执行后单笔上限将超过阈值。'),
  });
  await loginAsAdmin(page, '/daa/dashboard/workbench?tab=rebalance');

  await page.getByRole('button', { name: '生成/刷新建议' }).first().click();
  await expect(page.getByText('GLD', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /执行选中/ }).first().click();
  await expect(page.getByText('确认执行再平衡')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认执行' })).toBeEnabled();
  await page.getByRole('button', { name: '确认执行' }).click();

  await expect(page.getByText('执行被风控阻断')).toBeVisible();
  await expect(page.getByText('执行前风控阻断，订单未提交。')).toBeVisible();
  await expect(page.getByText('详情：请先调整目标权重或建议勾选后重试。')).toBeVisible();
});

test('策略实验室会对空资产池给出空状态并禁用运行', async ({ page }) => {
  const state = createEmptyStrategyLabState();

  await mockDaaApis(page, state);
  await loginAsAdmin(page, '/daa/dashboard/strategy-lab');

  await expect(page.getByText('当前没有可研究资产')).toBeVisible();
  await expect(page.getByRole('link', { name: '去资产发现' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: '去观察列表' }).first()).toBeVisible();
  await expect(page.getByTestId('strategy-lab-run-button')).toBeDisabled();
});

test('策略实验室在运行失败时展示错误且保持在当前页', async ({ page }) => {
  const state = createCrossMarketState();

  await mockDaaApis(page, state, {
    runError: {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: '策略实验室运行失败：价格序列服务超时。',
    },
  });
  await loginAsAdmin(page, '/daa/dashboard/strategy-lab');

  await expect(page.getByTestId('strategy-lab-run-button')).toBeEnabled();
  await page.getByTestId('strategy-lab-run-button').click();
  await expect(page.getByText('策略实验室运行失败：价格序列服务超时。')).toBeVisible();
  await expect(page).toHaveURL(/\/daa\/dashboard\/strategy-lab/);
  await expect(page.getByRole('heading', { name: '策略实验室' })).toBeVisible();
});

test('策略实验室会在参数变化后标记结果过期，并在重跑后展示差异化结果', async ({ page }) => {
  const state = createCrossMarketState();
  const runPayloads: Array<Record<string, any>> = [];

  await mockDaaApis(page, state, {
    runHandler: (payload) => {
      runPayloads.push(payload);
      const variant = String(payload.benchmarkSymbol || 'SPY').trim().toUpperCase() === 'QQQ' ? 'qqq' : 'default';
      return buildStrategyLabRunResult(state, payload, variant);
    },
  });
  await loginAsAdmin(page, '/daa/dashboard/strategy-lab');

  await page.getByTestId('strategy-lab-run-button').click();
  await expect(page.getByText('运行总览')).toBeVisible();
  await expect(page.getByRole('button', { name: /跨市场组合候选/ })).toBeVisible();

  const benchmarkInput = page.locator('label').filter({ hasText: '基准' }).locator('input').first();
  const minBarsInput = page.locator('label').filter({ hasText: '最少样本' }).locator('input').first();
  await benchmarkInput.fill('QQQ');
  await minBarsInput.fill('180');

  await expect(page.getByText('当前结果已不是这套输入的最新输出，请重新运行后再写回。')).toBeVisible();
  await expect(page.getByTestId('strategy-lab-writeback-button')).toBeDisabled();

  await page.getByTestId('strategy-lab-run-button').click();
  await expect(page.getByRole('button', { name: /纳指增强候选/ })).toBeVisible();
  await expect(page.getByText('运行警告')).toBeVisible();
  expect(runPayloads).toHaveLength(2);
  expect(String(runPayloads[1]?.benchmarkSymbol)).toBe('QQQ');
  expect(Number(runPayloads[1]?.minBars)).toBe(180);
});

test('策略实验室写回失败时保留结果并提示错误', async ({ page }) => {
  const state = createCrossMarketState();

  await mockDaaApis(page, state, {
    runHandler: (payload) => buildStrategyLabRunResult(state, payload, 'default'),
    writebackError: {
      status: 409,
      code: 'VALIDATION_FAILED',
      message: '写回失败：工作台目标版本已变化，请刷新后重试。',
    },
  });
  await loginAsAdmin(page, '/daa/dashboard/strategy-lab');

  await page.getByTestId('strategy-lab-run-button').click();
  await expect(page.getByText('候选详情')).toBeVisible();
  await page.getByTestId('strategy-lab-writeback-button').click();

  await expect(page.getByText('写回失败：工作台目标版本已变化，请刷新后重试。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '候选详情' })).toBeVisible();
  await expect(page.getByRole('button', { name: /跨市场组合候选/ })).toBeVisible();
});
