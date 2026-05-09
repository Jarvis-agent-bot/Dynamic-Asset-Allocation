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
};

const NOW = '2026-03-11T08:00:00.000Z';

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
    },
    policy: {
      enabled: true,
      shadowMode: false,
      drift: { enabled: true, mode: 'static_band', outerBandPct: 0.05, innerBandPct: 0.02, minNotionalBase: 200, volatilityLookbackDays: 60 },
      review: { enabled: true, frequency: 'monthly', dayOfMonth: 1, scheduledTimeUtc: '01:00', timezone: 'Asia/Shanghai' },
      throttle: { proposalDedupeWindowHours: 24, autoExecutionCooldownHours: 24, allowRiskReductionOverride: true, allowSevereRiskOverride: true, minScoreToBreakCooldown: 85 },
      actionScore: { proposalThreshold: 25, autoExecuteThreshold: 70 },
      execution: { autoGenerateEnabled: false, autoExecuteEnabled: false, maxSingleOrderPctOfNav: 0.1 },
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
      scheduledTimeUtc: '01:00',
      timezone: 'Asia/Shanghai',
    },
    policy: {
      enabled: true,
      shadowMode: false,
      drift: { enabled: true, mode: 'static_band', outerBandPct: 0.05, innerBandPct: 0.02, minNotionalBase: 200, volatilityLookbackDays: 60 },
      review: { enabled: true, frequency: 'monthly', dayOfMonth: 1, scheduledTimeUtc: '01:00', timezone: 'Asia/Shanghai' },
      throttle: { proposalDedupeWindowHours: 24, autoExecutionCooldownHours: 24, allowRiskReductionOverride: true, allowSevereRiskOverride: true, minScoreToBreakCooldown: 85 },
      actionScore: { proposalThreshold: 25, autoExecuteThreshold: 70 },
      execution: { autoGenerateEnabled: false, autoExecuteEnabled: false, maxSingleOrderPctOfNav: 0.1 },
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
