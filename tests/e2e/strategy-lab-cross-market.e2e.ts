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
};

type MockOptions = {
  runError?: {
    status?: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  onRunPayload?: (payload: Record<string, any>) => void;
  onWritebackPayload?: (payload: Record<string, any>) => void;
};

const NOW = '2026-03-08T08:00:00.000Z';
const DATE_SERIES = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06'];
const FEATURED_HK_SYMBOL = '0700.HK';
const FEATURED_CN_SYMBOL = '600519.SS';

async function loginAsAdmin(page: Page, returnTo = '/daa/dashboard') {
  await page.goto(`/daa/login?returnTo=${encodeURIComponent(returnTo)}`);

  const usernameInput = page.getByLabel('用户名');
  const passwordInput = page.getByLabel('密码');
  const submitButton = page.getByRole('button', { name: /登录系统/ });

  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('admin');
  await passwordInput.fill('admin123');

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/daa/dashboard'), { timeout: 15_000 }),
    submitButton.click(),
  ]);

  await expect.poll(() => {
    const current = new URL(page.url());
    const value = `${current.pathname}${current.search}`;
    return value === returnTo || value.startsWith(`${returnTo}?`) || value.startsWith(`${returnTo}&`);
  }).toBeTruthy();
  await expect(page.getByRole('navigation', { name: 'DAA 主导航' })).toBeVisible();
}

function makeTestIdSegment(input: { market: string; symbol: string }): string {
  return `${String(input.market || '').trim().toLowerCase()}-${String(input.symbol || '').trim().toLowerCase()}`
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createAsset(input: Partial<MockAsset> & Pick<MockAsset, 'assetKey' | 'symbol' | 'market'>): MockAsset {
  const targetWeightHint = Math.max(0, Number(input.targetWeightHint ?? 0));
  const actualWeightPct = Number(input.actualWeightPct ?? 0);
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
    holdingPrice: Number(input.holdingPrice ?? 0),
    costBasis: input.costBasis ?? null,
    holdingTags: input.holdingTags ?? [],
    watchEnabled: input.watchEnabled ?? true,
    targetWeightHint,
    watchTags: input.watchTags ?? [],
    notes: input.notes ?? null,
    lastPrice: Number(input.lastPrice ?? 0),
    priceUpdatedAt: input.priceUpdatedAt ?? NOW,
    priceStatus: input.priceStatus ?? 'fresh',
    priceSource: input.priceSource ?? 'playwright-mock',
    priceAgeSec: input.priceAgeSec ?? 0,
    valuationBase: input.valuationBase ?? null,
    fxRateToBase: input.fxRateToBase ?? 1,
    fxMissing: input.fxMissing ?? false,
    actualWeightPct,
    targetWeightPct: Number((targetWeightHint * 100).toFixed(2)),
    gapPct: input.gapPct ?? (targetWeightHint * 100 - actualWeightPct),
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

function createHappyPathState(): MockState {
  const aapl = createAsset({
    assetKey: 'US::AAPL',
    symbol: 'AAPL',
    market: 'US',
    currency: 'USD',
    assetClass: 'EQUITY',
    region: 'US',
    exchange: 'NASDAQ',
    instrumentType: 'STOCK',
    marketGroup: 'US_EQUITY',
    lastPrice: 100,
    targetWeightHint: 0.5,
    holdingQty: 100,
    holdingPrice: 100,
    costBasis: 98,
    actualWeightPct: 50,
    valuationBase: 50000,
  });
  const bnd = createAsset({
    assetKey: 'US::BND',
    symbol: 'BND',
    market: 'US',
    currency: 'USD',
    assetClass: 'BOND',
    region: 'US',
    exchange: 'NASDAQ',
    instrumentType: 'ETF',
    marketGroup: 'US_BOND',
    lastPrice: 80,
    targetWeightHint: 0.5,
    holdingQty: 625,
    holdingPrice: 80,
    costBasis: 79,
    actualWeightPct: 50,
    valuationBase: 50000,
  });
  const hk = createAsset({
    assetKey: 'HK::0700.HK',
    symbol: '0700.HK',
    market: 'HK',
    currency: 'HKD',
    assetClass: 'EQUITY',
    region: 'HK',
    exchange: 'HKEX',
    instrumentType: 'STOCK',
    marketGroup: 'HK_EQUITY',
    lastPrice: 780,
    targetWeightHint: 0,
    fxRateToBase: 0.128,
  });
  const cn = createAsset({
    assetKey: 'CN::600519.SS',
    symbol: '600519.SS',
    market: 'CN',
    currency: 'CNY',
    assetClass: 'EQUITY',
    region: 'CN',
    exchange: 'SSE',
    instrumentType: 'STOCK',
    marketGroup: 'CN_EQUITY',
    lastPrice: 1500,
    targetWeightHint: 0,
    fxRateToBase: 0.138,
  });

  return {
    assets: [aapl, bnd],
    systemConfig: {
      strategy: {
        account: {
          baseCurrency: 'USD',
          cash: 100000,
          investableCash: 100000,
          frozenCash: 0,
          totalEquity: 100000,
        },
        constraints: {
          maxPositionPct: 1,
          minNotional: 0,
          maxOrderPctOfNav: 0.2,
          tradeFeeRateBps: 5,
        },
        execution: {
          feeRateBps: 5,
          slippageBps: 6,
          timing: 't_plus_1_close',
        },
        policy: {
          baseDriftTriggerPct: 0.05,
          strongTrendDriftTriggerPct: 0.1,
          riskOffConsensusPct: 0.6,
          riskOffScalePct: 0.7,
          valueTrapThesisDriftPct: 0.12,
          sbIsolationScorePct: 0.35,
        },
        risk: {
          maxDrawdownPct: 0.15,
          perAssetStopLossPct: 0.2,
          perAssetTakeProfitPct: 0.25,
          maxConcentrationPct: 0.3,
          correlationCapPct: 0.6,
          maxTotalRiskExposurePct: 0.7,
          enforceOnExecution: true,
        },
        targetWeights: {},
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
    },
    featuredGroups: [
      {
        market: 'HK',
        marketLabelZh: '港股',
        items: [featuredItemFromAsset({ ...hk, name: '腾讯控股', thesisTagZh: '平台生态护城河' })],
      },
      {
        market: 'CN',
        marketLabelZh: 'A股',
        items: [featuredItemFromAsset({ ...cn, name: '贵州茅台', thesisTagZh: '白酒龙头现金流' })],
      },
    ],
  };
}

function createValidationErrorState(): MockState {
  return {
    assets: [
      createAsset({
        assetKey: 'US::AAPL',
        symbol: 'AAPL',
        market: 'US',
        currency: 'USD',
        assetClass: 'EQUITY',
        region: 'US',
        exchange: 'NASDAQ',
        instrumentType: 'STOCK',
        marketGroup: 'US_EQUITY',
        lastPrice: 100,
        targetWeightHint: 1,
        actualWeightPct: 100,
        holdingQty: 100,
        holdingPrice: 100,
        costBasis: 98,
        valuationBase: 100000,
      }),
      createAsset({
        assetKey: 'HK::0700.HK',
        symbol: '0700.HK',
        market: 'HK',
        currency: '',
        assetClass: 'EQUITY',
        region: 'HK',
        exchange: 'HKEX',
        instrumentType: 'STOCK',
        marketGroup: 'HK_EQUITY',
        lastPrice: 780,
        targetWeightHint: 0,
        fxRateToBase: null,
        fxMissing: true,
      }),
    ],
    systemConfig: {
      strategy: {
        account: {
          baseCurrency: 'USD',
          cash: 100000,
          investableCash: 100000,
          frozenCash: 0,
          totalEquity: 100000,
        },
      },
    },
    featuredGroups: [],
  };
}

function buildBootstrap(state: MockState): Record<string, any> {
  return {
    baseCurrency: 'USD',
    account: {
      cash: 100000,
      investableCash: 100000,
      frozenCash: 0,
      totalEquity: 100000,
    },
    assetUniverse: state.assets,
    execution: {
      logs: [],
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
    latestCycle: null,
    warnings: [],
  };
}

function buildWorkbenchReadModel(state: MockState): Record<string, any> {
  return {
    bootstrap: buildBootstrap(state),
    cycles: [],
    loadedAt: NOW,
  };
}

function buildStrategyLabSeedReadModel(state: MockState): Record<string, any> {
  const strategy = state.systemConfig.strategy || {};
  const account = strategy.account || {};
  const constraints = strategy.constraints || {};
  const execution = strategy.execution || {};
  const rebalanceStrategy = state.systemConfig.rebalanceStrategy || {};
  return {
    bootstrap: buildBootstrap(state),
    baseCurrency: String(account.baseCurrency || 'USD'),
    initialEquity: Number(account.totalEquity || account.cash || 100000),
    constraints: {
      maxPositionPct: Number(constraints.maxPositionPct || 1),
      minNotional: Number(constraints.minNotional || 0),
      maxOrderPctOfNav: Number(constraints.maxOrderPctOfNav || 0.2),
    },
    policy: {
      thresholdPct: Number(rebalanceStrategy.drift?.thresholdPct || 0.05),
      minTradeNotional: Number(strategy.policy?.minTradeNotional || constraints.minNotional || 0),
      cooldownSeconds: Number((rebalanceStrategy.cooldownHours || 24) * 3600),
    },
    execution: {
      feeRateBps: Number(execution.feeRateBps || constraints.tradeFeeRateBps || 0),
      slippageBps: Number(execution.slippageBps || 0),
      maxOrderPctOfNav: Number(constraints.maxOrderPctOfNav || 0.2),
    },
    availableAssets: state.assets,
    selectedAssetKeys: state.assets.filter((asset) => asset.watchEnabled || asset.holdingQty > 0).map((asset) => asset.assetKey),
    loadedAt: NOW,
  };
}

function buildTradesReadModel(): Record<string, any> {
  return {
    records: { cycles: [], orders: [] },
    reports: [],
    loadedAt: NOW,
  };
}

function buildBacktest(input: {
  totalReturn: number;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  rebalanceCount: number;
  turnoverNotional: number;
  totalFeesAbs: number;
  weights: Record<string, number>;
}): Record<string, any> {
  const initialEquity = 100000;
  const finalEquity = Number((initialEquity * (1 + input.totalReturn)).toFixed(2));
  return {
    schemaVersion: 1,
    dates: DATE_SERIES,
    equity: [initialEquity, initialEquity * 1.01, initialEquity * 1.023, finalEquity],
    dailyReturns: [0, 0.01, 0.012, input.totalReturn - 0.022],
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
        date: '2025-01-03',
        kind: 'rebalance',
        signalDate: '2025-01-02',
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
        cashAbs: 5000,
        cashPct01: 5000 / finalEquity,
        weightsBySymbolPct01: input.weights,
      },
    },
  };
}

function buildAttribution(input: {
  benchmarkReturn: number;
  totalReturn: number;
  weights: Record<string, number>;
}): Record<string, any> {
  const perAsset = Object.entries(input.weights).map(([symbol, avgWeight]) => ({
    symbol,
    avgWeight,
    assetReturn: symbol.includes('0700') ? 0.11 : symbol.includes('600519') ? 0.09 : symbol.includes('BND') ? 0.02 : 0.06,
    contributionToReturn: avgWeight * (symbol.includes('0700') ? 0.11 : symbol.includes('600519') ? 0.09 : symbol.includes('BND') ? 0.02 : 0.06),
    allocationEffect: avgWeight * 0.01,
    selectionEffect: avgWeight * 0.005,
  }));
  return {
    totalReturn: input.totalReturn,
    benchmark: { symbol: 'SPY', return: input.benchmarkReturn },
    activeReturn: input.totalReturn - input.benchmarkReturn,
    perAsset,
    rebalanceEvents: [
      { date: '2025-01-03', turnover: 9000, driftBefore: 0.08 },
    ],
    metrics: {
      sharpe: 1.4,
      maxDrawdown: 0.05,
      calmar: 1.2,
      volatility: 0.16,
      winRate: 0.75,
    },
  };
}

function buildStrategyLabRunResult(state: MockState): Record<string, any> {
  const currentWeights = Object.fromEntries(state.assets.map((asset) => [asset.assetKey, asset.targetWeightHint]));
  const executableWeights = {
    'US::AAPL': 0.2,
    'US::BND': 0.25,
    'HK::0700.HK': 0.3,
    'CN::600519.SS': 0.25,
  };
  const baselineWeights = {
    'US::AAPL': currentWeights['US::AAPL'] ?? 0.5,
    'US::BND': currentWeights['US::BND'] ?? 0.5,
    'HK::0700.HK': currentWeights['HK::0700.HK'] ?? 0,
    'CN::600519.SS': currentWeights['CN::600519.SS'] ?? 0,
  };

  const buildCandidate = (input: {
    id: 'baseline' | 'ensemble';
    label: string;
    score: number;
    totalReturn: number;
    sharpe: number;
    maxDrawdown: number;
    winRate: number;
    rebalanceCount: number;
    turnoverNotional: number;
    totalFeesAbs: number;
    weights: Record<string, number>;
    benchmarkReturn: number;
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
      weights: input.weights,
    }),
    attribution: buildAttribution({
      benchmarkReturn: input.benchmarkReturn,
      totalReturn: input.totalReturn,
      weights: input.weights,
    }),
  });

  const idealCandidates = [
    buildCandidate({
      id: 'ensemble',
      label: '跨市场组合候选',
      score: 92,
      totalReturn: 0.082,
      sharpe: 1.68,
      maxDrawdown: 0.051,
      winRate: 0.75,
      rebalanceCount: 2,
      turnoverNotional: 12000,
      totalFeesAbs: 0,
      weights: executableWeights,
      benchmarkReturn: 0.024,
    }),
    buildCandidate({
      id: 'baseline',
      label: '当前配置',
      score: 78,
      totalReturn: 0.041,
      sharpe: 1.11,
      maxDrawdown: 0.045,
      winRate: 0.5,
      rebalanceCount: 1,
      turnoverNotional: 4000,
      totalFeesAbs: 0,
      weights: baselineWeights,
      benchmarkReturn: 0.024,
    }),
  ];

  const executableCandidates = [
    buildCandidate({
      id: 'ensemble',
      label: '跨市场组合候选',
      score: 89,
      totalReturn: 0.071,
      sharpe: 1.6,
      maxDrawdown: 0.056,
      winRate: 0.75,
      rebalanceCount: 3,
      turnoverNotional: 14000,
      totalFeesAbs: 48,
      weights: executableWeights,
      benchmarkReturn: 0.024,
    }),
    buildCandidate({
      id: 'baseline',
      label: '当前配置',
      score: 74,
      totalReturn: 0.036,
      sharpe: 1.02,
      maxDrawdown: 0.047,
      winRate: 0.5,
      rebalanceCount: 1,
      turnoverNotional: 4500,
      totalFeesAbs: 12,
      weights: baselineWeights,
      benchmarkReturn: 0.024,
    }),
  ];

  return {
    generatedAt: NOW,
    benchmark: {
      symbol: 'SPY',
      dates: DATE_SERIES,
      equity: [100000, 101000, 102400, 102400],
      totalReturn: 0.024,
    },
    baseCurrency: 'USD',
    lookbackBars: 252,
    assetsUsed: state.assets.map((asset) => ({
      assetKey: asset.assetKey,
      symbol: asset.symbol,
      market: asset.market,
      currency: asset.currency,
      label: asset.symbol,
      yfinanceSymbol: asset.yfinanceSymbol,
      currentWeightPct: asset.actualWeightPct,
      currentTargetWeightPct: asset.targetWeightPct,
      holdingQty: asset.holdingQty,
      watchEnabled: asset.watchEnabled,
    })),
    diagnostics: {
      mode: 'intersection',
      minBars: 252,
      inputSymbolCount: state.assets.length,
      outputSymbolCount: state.assets.length,
      unionDateCount: DATE_SERIES.length,
      commonDateCount: DATE_SERIES.length,
      startDate: DATE_SERIES[0],
      endDate: DATE_SERIES[DATE_SERIES.length - 1],
      droppedSymbols: [],
      barsBySymbol: Object.fromEntries(state.assets.map((asset) => [asset.symbol, { raw: DATE_SERIES.length, cleaned: DATE_SERIES.length, aligned: DATE_SERIES.length, ffillCount: 0 }])),
    },
    currentTargetWeights: currentWeights,
    currentActualWeights: Object.fromEntries(state.assets.map((asset) => [asset.assetKey, asset.actualWeightPct / 100])),
    scenarios: [
      {
        scenarioId: 'ideal',
        label: '理想回测',
        description: '忽略真实执行摩擦，只看策略上限。',
        assumptions: ['按同一条 walk-forward 目标权重时间轴执行。', '交易时点固定为 T+1 close。', '不计手续费和滑点。'],
        constraints: { maxPositionPct: 1, minNotional: 0, maxOrderPctOfNav: 0.2 },
        policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
        execution: { timing: 't_plus_1_close', feeRateBps: 0, slippageBps: 0 },
        candidates: idealCandidates,
        bestCandidateId: 'ensemble',
        warnings: [],
      },
      {
        scenarioId: 'executable',
        label: '可执行回测',
        description: '纳入费用、滑点与单笔上限后的真实口径。',
        assumptions: ['沿用同一条 walk-forward 候选权重时间轴。', '费用、滑点与单笔 NAV 上限按真实执行口径折损。', '交易时点固定为 T+1 close。'],
        constraints: { maxPositionPct: 1, minNotional: 0, maxOrderPctOfNav: 0.2 },
        policy: { thresholdPct: 0.05, minTradeNotional: 0, cooldownSeconds: 0 },
        execution: { timing: 't_plus_1_close', feeRateBps: 5, slippageBps: 6 },
        candidates: executableCandidates,
        bestCandidateId: 'ensemble',
        warnings: [],
      },
    ],
    candidateComparisons: [
      {
        candidateId: 'ensemble',
        idealRank: 1,
        executableRank: 1,
        rankDelta: 0,
        executionGap: 0.011,
        sharpeGap: 0.08,
        turnoverDelta: 2000,
        rebalanceDelta: 1,
        sourceBreakdown: [
          { sourceId: 'fee', label: '费用', description: '手续费拖累收益。', returnImpact: 0.003, sharpeImpact: 0.01, turnoverDelta: 0, rebalanceDelta: 0 },
          { sourceId: 'slippage', label: '滑点', description: '成交价偏离信号价。', returnImpact: 0.002, sharpeImpact: 0.01, turnoverDelta: 0, rebalanceDelta: 0 },
          { sourceId: 'tradeFloor', label: '成交门槛', description: '最小成交额压制部分交易。', returnImpact: 0.003, sharpeImpact: 0.03, turnoverDelta: -300, rebalanceDelta: 0 },
          { sourceId: 'tradeCaps', label: '单次上限', description: '单笔 NAV 上限拉长建仓路径。', returnImpact: 0.003, sharpeImpact: 0.03, turnoverDelta: 2300, rebalanceDelta: 1 },
        ],
      },
      {
        candidateId: 'baseline',
        idealRank: 2,
        executableRank: 2,
        rankDelta: 0,
        executionGap: 0.005,
        sharpeGap: 0.09,
        turnoverDelta: 500,
        rebalanceDelta: 0,
        sourceBreakdown: [
          { sourceId: 'fee', label: '费用', description: '手续费拖累收益。', returnImpact: 0.002, sharpeImpact: 0.02, turnoverDelta: 0, rebalanceDelta: 0 },
          { sourceId: 'slippage', label: '滑点', description: '成交价偏离信号价。', returnImpact: 0.001, sharpeImpact: 0.01, turnoverDelta: 0, rebalanceDelta: 0 },
          { sourceId: 'tradeFloor', label: '成交门槛', description: '最小成交额影响有限。', returnImpact: 0.001, sharpeImpact: 0.03, turnoverDelta: 100, rebalanceDelta: 0 },
          { sourceId: 'tradeCaps', label: '单次上限', description: '单笔上限带来轻微拖累。', returnImpact: 0.001, sharpeImpact: 0.03, turnoverDelta: 400, rebalanceDelta: 0 },
        ],
      },
    ],
    defaultScenarioId: 'executable',
    candidates: executableCandidates,
    bestCandidateId: 'ensemble',
    warnings: [],
  };
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

async function fulfillJson(route: Route, body: Record<string, any>, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function mockDaaApis(page: Page, state: MockState, options: MockOptions = {}) {
  await page.route('**/api/daa/store/system-config', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: {
        version: 1,
        updatedAt: NOW,
        config: state.systemConfig,
      },
    });
  });

  await page.route('**/api/daa/workbench/bootstrap', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: buildBootstrap(state),
    });
  });

  await page.route('**/api/daa/read/workbench*', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: buildWorkbenchReadModel(state),
    });
  });

  await page.route('**/api/daa/read/strategy-lab-seed', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: buildStrategyLabSeedReadModel(state),
    });
  });

  await page.route('**/api/daa/read/trades*', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: buildTradesReadModel(),
    });
  });

  await page.route('**/api/daa/workbench/rebalance/cycles*', async (route) => {
    await fulfillJson(route, {
      ok: true,
      data: {
        cycles: [],
      },
    });
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

  await page.route('**/api/daa/workbench/assets/upsert', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const row = upsertAsset(state, payload);
    await fulfillJson(route, {
      ok: true,
      data: { row },
    });
  });

  await page.route('**/api/daa/strategy-lab/run', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    options.onRunPayload?.(payload);
    if (options.runError) {
      await fulfillJson(route, {
        ok: false,
        error: {
          code: options.runError.code,
          message: options.runError.message,
          details: options.runError.details,
        },
      }, options.runError.status ?? 400);
      return;
    }
    await fulfillJson(route, {
      ok: true,
      data: buildStrategyLabRunResult(state),
    });
  });

  await page.route('**/api/daa/strategy-lab/writeback', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    options.onWritebackPayload?.(payload);
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
    state.systemConfig = {
      ...state.systemConfig,
      strategy: {
        ...(state.systemConfig.strategy || {}),
        targetWeights: {},
      },
    };

    await fulfillJson(route, {
      ok: true,
      data: {
        candidateId: String(payload.candidateId || 'ensemble'),
        updatedAssetKeys: scopeAssetKeys,
        updatedCount: scopeAssetKeys.length,
        clearedConfigTargetWeights: true,
        wroteAt: NOW,
      },
    });
  });
}

test('加 HK/CN 资产后可以完成跨币种回测并写回当前配置', async ({ page }) => {
  const state = createHappyPathState();
  let lastRunPayload: Record<string, any> | null = null;
  let lastWritebackPayload: Record<string, any> | null = null;

  await loginAsAdmin(page);
  await mockDaaApis(page, state, {
    onRunPayload: (payload) => {
      lastRunPayload = payload;
    },
    onWritebackPayload: (payload) => {
      lastWritebackPayload = payload;
    },
  });

  await page.goto('/daa/dashboard/workbench?tab=discovery');

  const hkAddButton = page.getByTestId(`featured-asset-add-${makeTestIdSegment({ market: 'HK', symbol: FEATURED_HK_SYMBOL })}`);
  const cnAddButton = page.getByTestId(`featured-asset-add-${makeTestIdSegment({ market: 'CN', symbol: FEATURED_CN_SYMBOL })}`);

  await expect(hkAddButton).toBeVisible();
  await expect(cnAddButton).toBeVisible();

  await hkAddButton.click();
  await expect(hkAddButton).toHaveText(/已加入/);

  await cnAddButton.click();
  await expect(cnAddButton).toHaveText(/已加入/);

  await page.goto('/daa/dashboard/strategy-lab');

  await expect(page.getByText('0700.HK', { exact: true })).toBeVisible();
  await expect(page.getByText('600519.SS', { exact: true })).toBeVisible();
  await expect(page.getByTestId('strategy-lab-run-button')).toBeEnabled();

  await page.getByTestId('strategy-lab-run-button').click();

  await expect(page.getByText('策略实验室运行完成，生成 2 组候选。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '运行总览' })).toBeVisible();
  await expect(page.getByText('理想回测')).toBeVisible();
  await expect(page.getByText('可执行回测')).toBeVisible();
  await expect(page.getByRole('heading', { name: '候选详情' })).toBeVisible();
  await expect(page.getByRole('button', { name: /跨市场组合候选/ })).toBeVisible();

  expect(lastRunPayload).not.toBeNull();
  expect(lastRunPayload?.assets).toEqual(expect.arrayContaining([
    expect.objectContaining({ assetKey: 'HK::0700.HK', symbol: '0700.HK', market: 'HK', currency: 'HKD' }),
    expect.objectContaining({ assetKey: 'CN::600519.SS', symbol: '600519.SS', market: 'CN', currency: 'CNY' }),
  ]));

  await page.getByTestId('strategy-lab-writeback-button').click();

  await expect(page.getByText('已将 跨市场组合候选 写回为当前目标。')).toBeVisible();
  await expect(page.getByText('0700.HK', { exact: true })).toBeVisible();
  await expect(page.getByText('600519.SS', { exact: true })).toBeVisible();

  expect(lastWritebackPayload).not.toBeNull();
  expect(lastWritebackPayload).toMatchObject({
    candidateId: 'ensemble',
    scopeAssetKeys: expect.arrayContaining(['HK::0700.HK', 'CN::600519.SS']),
  });
  expect(Number(lastWritebackPayload?.weightsByAssetKey?.['HK::0700.HK'] || 0)).toBeGreaterThan(0);
  expect(Number(lastWritebackPayload?.weightsByAssetKey?.['CN::600519.SS'] || 0)).toBeGreaterThan(0);
});

test('策略实验室会把跨币种字段缺失展示成产品化校验提示', async ({ page }) => {
  const state = createValidationErrorState();

  await loginAsAdmin(page);
  await mockDaaApis(page, state, {
    runError: {
      code: 'VALIDATION_FAILED',
      message: '以下资产缺少币种字段，暂时无法做跨币种回测：0700.HK。',
      details: {
        code: 'MISSING_ASSET_CURRENCY',
        assets: ['0700.HK'],
      },
    },
  });

  await page.goto('/daa/dashboard/strategy-lab');

  await expect(page.getByTestId('strategy-lab-run-button')).toBeEnabled();
  await page.getByTestId('strategy-lab-run-button').click();

  await expect(page.getByText('以下资产缺少币种字段，暂时无法做跨币种回测：0700.HK。')).toBeVisible();
  await expect(page.getByText('(VALIDATION_FAILED)')).toBeVisible();
});
