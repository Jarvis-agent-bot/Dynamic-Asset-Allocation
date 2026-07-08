import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import {
  buildAssetUniverseView,
  buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture,
  buildSystemConfigRow,
} from '@/src/daa/__tests__/testDataFactories';

vi.mock('@/src/daa/cron/auth', () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock('@/src/daa/store/daaStorePg', () => ({
  ensureDaaStoreSchemaPg: vi.fn(async () => undefined),
  getDaaSystemConfig: vi.fn(async () => ({
    config: {
      policy: {
        execution: { autoGenerateEnabled: true },
        drift: { enabled: true, outerBandPct: 0.05 },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: true,
          onRiskTriggered: true,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onRiskTriggered: false,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
      },
    },
  })),
  listDaaRebalanceCycles: vi.fn(async () => []),
  listDaaTradeTickets: vi.fn(async () => []),
}));

vi.mock('@/src/daa/store/notificationDeliveryLogRepo', () => ({
  hasTodayNotification: vi.fn(async () => false),
}));

vi.mock('@/src/daa/modules/workbench/workbenchReadService', () => ({
  buildWorkbenchBootstrap: vi.fn(async () => ({
    account: { cash: 3000, investableCash: 3000, frozenCash: 0, totalEquity: 50000 },
    baseCurrency: 'USD',
    assetUniverse: [
      { symbol: 'AAPL', holdingQty: 10, lastPrice: 180, holdingPrice: 170, gapPct: 6.0, watchEnabled: true, targetWeightHint: 0.1 },
      { symbol: 'BND', holdingQty: 20, lastPrice: 75, holdingPrice: 74, gapPct: 1.0, watchEnabled: true, targetWeightHint: 0.2 },
    ],
    marketContext: { regime: 'risk_on', indicators: [], scopes: [] },
    policy: { review: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, outerBandPct: 0.05 } },
    execution: { logs: [] },
    rebalance: {},
    latestCycle: null,
    warnings: [],
  })),
}));

vi.mock('@/src/daa/modules/workbench/workbenchRebalanceCycleService', () => ({
  generateWorkbenchRebalanceCycle: vi.fn(async () => ({
    created: true,
    skippedByCooldown: false,
    cooldownUntil: null,
    message: '已生成偏移触发周期',
    cycle: {
      cycleId: 'cycle-drift-1',
      triggerReason: '偏移量阈值触发',
      proposals: [{ assetKey: 'US::AAPL' }, { assetKey: 'US::BND' }],
      riskCheck: { overallStatus: 'warn' },
    },
  })),
}));

vi.mock('@/src/daa/automation/riskAutopilotTrigger', () => ({
  runRiskAutopilotDaily: vi.fn(async () => ({
    attempted: true,
    skipped: false,
    reason: '未形成新的调仓建议。',
    runId: 'agent-run-risk-1',
    cycleId: null,
    proposalCount: 0,
    idempotencyKey: 'cron_risk_autopilot:2026-03-10:fixture',
    jobId: 'risk-agent-job-1',
    requestId: 'risk-agent-request-1',
  })),
}));

vi.mock('@/src/daa/automation/autoRebalanceExecution', () => ({
  executeAutoRebalanceCycle: vi.fn(async () => ({
    attempted: true,
    executed: false,
    ordersCount: 0,
    blockedReason: '自动执行未开启。',
    error: '自动执行未开启。',
    authority: null,
  })),
}));

vi.mock('@/src/daa/notify/telegram', () => ({
  sendTelegramByEnv: vi.fn(async () => null),
}));

vi.mock('@/src/daa/notify/feishu', () => ({
  sendFeishuByEnv: vi.fn(async () => null),
}));

vi.mock('@/src/daa/hf/hfService', () => ({
  runHumanIngest: vi.fn(async () => ({
    summary: {
      sourceStatus: 'primary',
      signalCount: 2,
      diagnostics: { upstream: 'ok' },
    },
    batch: {
      signals: [{ id: 's1' }, { id: 's2' }],
      asOfDate: '2026-03-10',
      generatedAt: '2026-03-10T08:00:00.000Z',
    },
  })),
}));

vi.mock('@/src/daa/modules/marketContext/marketIndicatorService', () => ({
  refreshMarketIndicators: vi.fn(async () => ({
    refreshedCount: 3,
    marketContext: {
      regime: 'risk_on',
      scorePct: 66,
    },
    indicators: [
      { key: 'vix', value: 18.5 },
      { key: 'btcVolatility', value: 0.42 },
    ],
  })),
}));

import { POST as driftCheckPost } from '@/app/api/daa/cron/drift-check/route';
import { POST as hfIngestPost } from '@/app/api/daa/cron/hf-ingest/route';
import { POST as marketIndicatorsRefreshPost } from '@/app/api/daa/cron/market-indicators-refresh/route';

import { requireCronAuth } from '@/src/daa/cron/auth';
import { sendTelegramByEnv } from '@/src/daa/notify/telegram';
import { refreshMarketIndicators } from '@/src/daa/modules/marketContext/marketIndicatorService';
import { buildWorkbenchBootstrap } from '@/src/daa/modules/workbench/workbenchReadService';
import { generateWorkbenchRebalanceCycle } from '@/src/daa/modules/workbench/workbenchRebalanceCycleService';
import { runRiskAutopilotDaily } from '@/src/daa/automation/riskAutopilotTrigger';
import { executeAutoRebalanceCycle } from '@/src/daa/automation/autoRebalanceExecution';
import { runHumanIngest } from '@/src/daa/hf/hfService';
import { getDaaSystemConfig, listDaaRebalanceCycles } from '@/src/daa/store/daaStorePg';
import { hasTodayNotification } from '@/src/daa/store/notificationDeliveryLogRepo';

function buildDriftConfig(input: {
  autoGenerateEnabled: boolean;
  telegramEnabled?: boolean;
  feishuEnabled?: boolean;
}) {
  return buildSystemConfigRow({
    policy: {
      execution: { autoGenerateEnabled: input.autoGenerateEnabled },
      drift: { enabled: true, outerBandPct: 0.05 },
    },
    notification: {
      telegram: {
        enabled: input.telegramEnabled ?? true,
        onDriftTrigger: input.telegramEnabled ?? true,
        onRiskTriggered: input.telegramEnabled ?? true,
      },
      feishu: {
        enabled: input.feishuEnabled ?? false,
        onDriftTrigger: input.feishuEnabled ?? false,
        onRiskTriggered: input.feishuEnabled ?? false,
      },
    },
  });
}

function buildHumanIngestResult(input: {
  sourceStatus: 'live' | 'fallback_seed';
  signalCount: number;
  diagnostics?: string[];
}): Awaited<ReturnType<typeof runHumanIngest>> {
  const signals = Array.from({ length: input.signalCount }, (_, index) => ({
    symbol: `SYM${index + 1}`,
    market: 'US',
    aggregatedScorePct: 70,
    convictionPct: 60,
    thesisDriftPct: 4,
    momentumRegime: 'neutral' as const,
    stance: 'neutral' as const,
    confidencePct: 55,
    evidenceCount: 1,
    actorIds: [`actor-${index + 1}`],
    sourceRefs: [`human://sym${index + 1}`],
    riskTags: [],
  }));
  return {
    summary: {
      ingestedAt: '2026-03-10T08:00:00.000Z',
      marketScope: ['US'],
      actorCount: input.signalCount,
      holdingCount: input.signalCount,
      signalCount: input.signalCount,
      mode: 'official_first',
      sourceStatus: input.sourceStatus,
      diagnostics: input.diagnostics ?? [],
    },
    batch: {
      generatedAt: '2026-03-10T08:00:00.000Z',
      asOfDate: '2026-03-10',
      marketScope: ['US'],
      mode: 'official_first',
      sourceStatus: input.sourceStatus,
      diagnostics: input.diagnostics ?? [],
      actorCount: input.signalCount,
      holdingCount: input.signalCount,
      signals,
      sources: [{
        channel: 'official_fund_house',
        sourceName: 'fixture',
        itemCount: input.signalCount,
      }],
    },
  };
}

describe('cron-remaining-routes-v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCronAuth).mockResolvedValue(null);
    vi.mocked(hasTodayNotification).mockResolvedValue(false);
    vi.mocked(listDaaRebalanceCycles).mockResolvedValue([]);
    vi.mocked(executeAutoRebalanceCycle).mockResolvedValue({
      attempted: true,
      executed: false,
      ordersCount: 0,
      blockedReason: '自动执行未开启。',
      error: '自动执行未开启。',
      authority: null,
    });
  });

  it('drift-check 未通过 cron 鉴权时返回 401', async () => {
    vi.mocked(requireCronAuth).mockResolvedValue(NextResponse.json({ ok: false }, { status: 401 }));

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'CRON_AUTH_FAILED',
        message: 'cron unauthorized',
      },
    });
    expect(vi.mocked(buildWorkbenchBootstrap)).not.toHaveBeenCalled();
  });

  it('drift-check 在自动生成关闭时仍检测偏移但不推送无行动通知', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildDriftConfig({
      autoGenerateEnabled: false,
      telegramEnabled: true,
      feishuEnabled: false,
    }));

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      driftDetected: true,
      driftedAssetCount: 1,
      autoGenerateEnabled: false,
    });
    // 仍检测偏移，但无新调仓周期时只进入日报/简报，不再刷 TG。
    expect(vi.mocked(buildWorkbenchBootstrap)).toHaveBeenCalledWith({ syncPrices: false, autoRiskCycle: true });
    expect(vi.mocked(generateWorkbenchRebalanceCycle)).not.toHaveBeenCalled();
    expect(json.data.driftTriggerNotified).toBe(false);
    expect(json.data.driftTriggerSkippedReason).toBe('drift notification folded into daily review');
    expect(vi.mocked(sendTelegramByEnv)).not.toHaveBeenCalled();
  });

  it('drift-check 成功创建周期时会预热 bootstrap 并发送通知', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildDriftConfig({
      autoGenerateEnabled: true,
      telegramEnabled: true,
      feishuEnabled: false,
    }));

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      skipped: false,
      created: true,
      cycleId: 'cycle-drift-1',
      proposalCount: 2,
      driftDetected: true,
    });
    expect(vi.mocked(buildWorkbenchBootstrap)).toHaveBeenCalledWith({ syncPrices: false, autoRiskCycle: true });
    expect(vi.mocked(generateWorkbenchRebalanceCycle)).toHaveBeenCalledWith({
      triggerSource: 'drift',
      triggerReason: '偏移量阈值触发',
      manual: false,
    });
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    const message = String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '');
    expect(message).toContain('[行动] 调仓 | 调仓建议已生成');
    expect(message).toContain('状态: 已生成调仓周期 cycle-drift-1');
    expect(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[1]).toMatchObject({
      cycleId: 'cycle-drift-1',
      requestJson: {
        newCycleCreated: true,
        referenceCycleId: null,
      },
    });
  });

  it('drift-check 未创建新周期时不推送偏移流水通知', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildDriftConfig({
      autoGenerateEnabled: true,
      telegramEnabled: true,
      feishuEnabled: false,
    }));
    vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValueOnce({
      created: false,
      skippedByCooldown: true,
      cooldownUntil: '2026-03-10T09:00:00.000Z',
      message: '冷静期生效中，24 小时内不重复自动触发',
      cycle: {
        cycleId: 'cycle-old-1',
        triggerReason: '投资助理目标权重调仓',
        proposals: [{ assetKey: 'US::AAPL' }, { assetKey: 'US::BND' }],
        riskCheck: { overallStatus: 'warn' },
      },
    } as unknown as Awaited<ReturnType<typeof generateWorkbenchRebalanceCycle>>);

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      created: false,
      skippedByCooldown: true,
      cycleId: null,
      referenceCycleId: 'cycle-old-1',
      proposalCount: 0,
      driftDetected: true,
      driftTriggerNotified: false,
      driftTriggerSkippedReason: 'drift notification folded into daily review',
    });
    expect(vi.mocked(sendTelegramByEnv)).not.toHaveBeenCalled();
  });

  it('drift-check 当天已成功推送漂移通知时不重复发送旧周期提醒', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildDriftConfig({
      autoGenerateEnabled: true,
      telegramEnabled: true,
      feishuEnabled: false,
    }));
    vi.mocked(hasTodayNotification).mockResolvedValue(true);
    vi.mocked(generateWorkbenchRebalanceCycle).mockResolvedValueOnce({
      created: false,
      skippedByCooldown: false,
      cooldownUntil: null,
      message: '当日偏移检查已完成，跳过重复触发。',
      cycle: {
        cycleId: 'cycle-drift-1',
        triggerReason: '偏移量阈值触发',
        proposals: [{ assetKey: 'US::AAPL' }, { assetKey: 'US::BND' }],
        riskCheck: { overallStatus: 'warn' },
      },
    } as unknown as Awaited<ReturnType<typeof generateWorkbenchRebalanceCycle>>);

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      created: false,
      cycleId: null,
      referenceCycleId: 'cycle-drift-1',
      driftDetected: true,
      driftTriggerNotified: false,
      driftTriggerSkippedReason: 'drift notification folded into daily review',
    });
    expect(vi.mocked(hasTodayNotification)).not.toHaveBeenCalledWith('drift_triggered');
    expect(vi.mocked(sendTelegramByEnv)).not.toHaveBeenCalled();
  });

  it('drift-check 风控通知按统一阈值过滤未触发止损的资产', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      policy: {
        execution: { autoGenerateEnabled: false },
        drift: { enabled: true, outerBandPct: 0.05 },
      },
      strategy: {
        risk: {
          perAssetStopLossPct: 0.22,
          perAssetTakeProfitPct: 0.35,
        },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: false,
          onRiskTriggered: true,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onRiskTriggered: false,
        },
      },
    }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce(buildWorkbenchBootstrapFixture({
      account: { cash: 3000, investableCash: 3000, frozenCash: 0, totalEquity: 50000 },
      baseCurrency: 'USD',
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: 'CRYPTO::ETH-USD',
          symbol: 'ETH-USD',
          market: 'CRYPTO',
          currency: 'USD',
          holdingQty: 1,
          holdingPrice: 1000,
          lastPrice: 772,
          valuationBase: 772,
          costBasisInBase: 1000,
          unrealizedPnlPct: -22.8,
          actualWeightPct: 0,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
        buildAssetUniverseView({
          assetKey: 'US::MU',
          symbol: 'MU',
          market: 'US',
          currency: 'USD',
          holdingQty: 10,
          holdingPrice: 100,
          lastPrice: 135.5,
          valuationBase: 1355,
          costBasisInBase: 1000,
          unrealizedPnlPct: null,
          actualWeightPct: 0,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
        buildAssetUniverseView({
          assetKey: 'CRYPTO::SOL-USD',
          symbol: 'SOL-USD',
          market: 'CRYPTO',
          currency: 'USD',
          holdingQty: 10,
          holdingPrice: 100,
          lastPrice: 79.2,
          valuationBase: 792,
          costBasisInBase: 1000,
          unrealizedPnlPct: -20.8,
          actualWeightPct: 0,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
      ],
      marketContext: { regime: 'risk_on', indicators: [], scopes: [] },
      policy: { review: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, outerBandPct: 0.05 } },
      execution: { logs: [] },
      rebalance: {},
      latestCycle: null,
      warnings: [],
    }));

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      driftDetected: false,
      riskTriggeredCount: 2,
      riskTriggerNotified: true,
      riskAgentReview: {
        attempted: true,
        skipped: false,
        runId: 'agent-run-risk-1',
        cycleId: null,
        proposalCount: 0,
      },
    });
    expect(vi.mocked(runRiskAutopilotDaily)).toHaveBeenCalledWith(expect.objectContaining({
      req: expect.any(Request),
      source: 'cron_drift_check',
      reason: '止盈止损触发即时审核',
      triggers: [
        { symbol: 'ETH-USD', triggerType: 'stop_loss' },
        { symbol: 'MU', triggerType: 'take_profit' },
      ],
    }));
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    const message = String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '');
    expect(message).toContain('[紧急] 风控 | 止盈/止损触发');
    expect(message).toContain('状态: 已完成即时审核，未生成新建议：未形成新的调仓建议。');
    expect(message).toContain('触发: 止损 1 项 / 止盈 1 项');
    expect(message).toContain('ETH-USD: 止损 -22.8%');
    expect(message).toContain('MU: 止盈 35.5%');
    expect(message).not.toContain('SOL-USD');
  });

  it('drift-check 有待处理风险周期时会先尝试自动执行止损周期', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      policy: {
        execution: {
          autoGenerateEnabled: true,
          autoExecuteEnabled: true,
        },
        drift: { enabled: true, outerBandPct: 0.05 },
      },
      strategy: {
        risk: {
          perAssetStopLossPct: 0.2,
          perAssetTakeProfitPct: 0.35,
        },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: false,
          onRiskTriggered: true,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onRiskTriggered: false,
        },
      },
    }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce(buildWorkbenchBootstrapFixture({
      account: { cash: 3000, investableCash: 3000, frozenCash: 0, totalEquity: 50000 },
      baseCurrency: 'USD',
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: 'HK::1810.HK',
          symbol: '1810.HK',
          market: 'HK',
          currency: 'HKD',
          holdingQty: 764.879,
          holdingPrice: 30.7,
          lastPrice: 22.6,
          valuationBase: 2204.12,
          costBasisInBase: 2999.22,
          unrealizedPnlPct: -26.5,
          actualWeightPct: 2.2,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 2.2,
          fxMissing: false,
        }),
      ],
      marketContext: { regime: 'risk_on', indicators: [], scopes: [] },
      policy: { review: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, outerBandPct: 0.05 } },
      execution: { logs: [] },
      rebalance: {},
      latestCycle: null,
      warnings: [],
    }));
    vi.mocked(listDaaRebalanceCycles).mockResolvedValueOnce([
      {
        cycleId: 'risk-cycle-1810',
        status: 'generated',
        triggerSource: 'risk',
        triggerReason: '1810.HK 触发止损(26.50%)',
        snapshotAt: '2026-07-03T01:03:16.000Z',
        equitySnapshot: 50000,
        driftSnapshot: [],
        proposals: [{
          assetKey: 'HK::1810.HK',
          symbol: '1810.HK',
          currency: 'HKD',
          fxRateToBase: 0.1275,
          side: 'SELL',
          suggestedQty: 764.879,
          suggestedNotional: 2204.12,
          price: 22.6,
          sellAll: true,
          reason: '触发止损阈值：浮亏 26.50%',
          selected: true,
          hfContribution: null,
        }],
        riskCheck: {
          overallStatus: 'warn',
          items: [{ rule: 'stop_loss_breach', status: 'warn', current: 26.5, limit: 20, message: '存在持仓浮亏' }],
        },
        executionStartedAt: null,
        executedAt: null,
        executedOrders: [],
        executionSummary: null,
        cancelledAt: null,
        cancelReason: null,
        notes: null,
        marketContext: null,
        policyDecisionId: null,
        intentIds: [],
        signalIds: [],
        policySnapshot: null,
        proposalPlanId: null,
        createdAt: '2026-07-03T01:03:16.000Z',
      } as Awaited<ReturnType<typeof listDaaRebalanceCycles>>[number],
    ]);
    vi.mocked(executeAutoRebalanceCycle).mockResolvedValueOnce({
      attempted: true,
      executed: true,
      ordersCount: 1,
      blockedReason: null,
      error: null,
      authority: null,
    });

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.riskAutoExecute).toMatchObject({
      attempted: true,
      executed: true,
      ordersCount: 1,
      cycleId: 'risk-cycle-1810',
    });
    expect(vi.mocked(executeAutoRebalanceCycle)).toHaveBeenCalledWith(expect.objectContaining({
      triggerSource: 'risk',
      totalEquity: 50000,
      cycle: expect.objectContaining({
        cycleId: 'risk-cycle-1810',
      }),
    }));
    const message = String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '');
    expect(message).toContain('状态: 风险周期 risk-cycle-1810 已自动执行 1 笔');
    expect(message).toContain('风险执行: 风险周期 risk-cycle-1810 已自动执行 1 笔');
    expect(message).toContain('下一步: 风险周期 risk-cycle-1810 已自动执行；请查看成交记录和仓位变化。');
    expect(message).not.toContain('继续观察');
  });

  it('drift-check 会按资产执行多个最新有效风险周期并跳过无持仓旧周期', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      policy: {
        execution: { autoGenerateEnabled: false, autoExecuteEnabled: true },
        drift: { enabled: true, outerBandPct: 0.05 },
      },
      strategy: {
        constraints: { minNotional: 200 },
        risk: {
          perAssetStopLossPct: 0.2,
          perAssetTakeProfitPct: 0.25,
        },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: false,
          onRiskTriggered: true,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onRiskTriggered: false,
        },
      },
    }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce(buildWorkbenchBootstrapFixture({
      account: { cash: 3000, investableCash: 3000, frozenCash: 0, totalEquity: 50000 },
      baseCurrency: 'USD',
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: 'US::AMD',
          symbol: 'AMD',
          market: 'US',
          currency: 'USD',
          holdingQty: 2.36,
          holdingPrice: 424.1,
          lastPrice: 542.52,
          valuationBase: 1280,
          costBasisInBase: 999,
          unrealizedPnlPct: 28.1,
          actualWeightPct: 2.6,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
        buildAssetUniverseView({
          assetKey: 'KR::005930.KS',
          symbol: '005930.KS',
          market: 'KR',
          currency: 'KRW',
          holdingQty: 27.65,
          holdingPrice: 270500,
          lastPrice: 349000,
          valuationBase: 6400,
          costBasisInBase: 5000,
          unrealizedPnlPct: 28,
          actualWeightPct: 12.8,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
      ],
      marketContext: { regime: 'risk_on', indicators: [], scopes: [] },
      policy: { review: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, outerBandPct: 0.05 } },
      execution: { logs: [] },
      rebalance: {},
      latestCycle: null,
      warnings: [],
    }));
    vi.mocked(listDaaRebalanceCycles).mockResolvedValueOnce([
      {
        cycleId: 'old-no-position-1810',
        status: 'generated',
        triggerSource: 'risk',
        triggerReason: '1810.HK 旧止损',
        snapshotAt: '2026-06-30T01:00:00.000Z',
        equitySnapshot: 50000,
        driftSnapshot: [],
        proposals: [{
          assetKey: 'HK::1810.HK',
          symbol: '1810.HK',
          currency: 'HKD',
          fxRateToBase: 0.1275,
          side: 'SELL',
          suggestedQty: 764.879,
          suggestedNotional: 2100,
          price: 21.64,
          sellAll: true,
          reason: '触发止损阈值：浮亏 29.63%',
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: 'warn', items: [] },
        executionStartedAt: null,
        executedAt: null,
        executedOrders: [],
        executionSummary: null,
        cancelledAt: null,
        cancelReason: null,
        notes: null,
        marketContext: null,
        policyDecisionId: null,
        intentIds: [],
        signalIds: [],
        policySnapshot: null,
        proposalPlanId: null,
        createdAt: '2026-06-30T01:00:00.000Z',
      } as Awaited<ReturnType<typeof listDaaRebalanceCycles>>[number],
      {
        cycleId: 'risk-cycle-amd-latest',
        status: 'reviewing',
        triggerSource: 'risk',
        triggerReason: 'AMD 触发止盈',
        snapshotAt: '2026-07-02T01:00:00.000Z',
        equitySnapshot: 50000,
        driftSnapshot: [],
        proposals: [{
          assetKey: 'US::AMD',
          symbol: 'AMD',
          currency: 'USD',
          fxRateToBase: 1,
          side: 'SELL',
          suggestedQty: 1.18,
          suggestedNotional: 640,
          price: 542.52,
          sellAll: false,
          reason: '触发止盈阈值：浮盈 28.10%',
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: 'warn', items: [] },
        executionStartedAt: null,
        executedAt: null,
        executedOrders: [],
        executionSummary: null,
        cancelledAt: null,
        cancelReason: null,
        notes: null,
        marketContext: null,
        policyDecisionId: null,
        intentIds: [],
        signalIds: [],
        policySnapshot: null,
        proposalPlanId: null,
        createdAt: '2026-07-02T01:00:00.000Z',
      } as Awaited<ReturnType<typeof listDaaRebalanceCycles>>[number],
      {
        cycleId: 'risk-cycle-samsung-latest',
        status: 'generated',
        triggerSource: 'risk',
        triggerReason: '005930.KS 触发止盈',
        snapshotAt: '2026-06-25T01:00:00.000Z',
        equitySnapshot: 50000,
        driftSnapshot: [],
        proposals: [{
          assetKey: 'KR::005930.KS',
          symbol: '005930.KS',
          currency: 'KRW',
          fxRateToBase: 0.00069,
          side: 'SELL',
          suggestedQty: 13.82,
          suggestedNotional: 3300,
          price: 349000,
          sellAll: false,
          reason: '触发止盈阈值：浮盈 28.00%',
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: 'warn', items: [] },
        executionStartedAt: null,
        executedAt: null,
        executedOrders: [],
        executionSummary: null,
        cancelledAt: null,
        cancelReason: null,
        notes: null,
        marketContext: null,
        policyDecisionId: null,
        intentIds: [],
        signalIds: [],
        policySnapshot: null,
        proposalPlanId: null,
        createdAt: '2026-06-25T01:00:00.000Z',
      } as Awaited<ReturnType<typeof listDaaRebalanceCycles>>[number],
    ]);
    vi.mocked(executeAutoRebalanceCycle)
      .mockResolvedValueOnce({
        attempted: true,
        executed: true,
        ordersCount: 1,
        blockedReason: null,
        error: null,
        authority: null,
      })
      .mockResolvedValueOnce({
        attempted: true,
        executed: true,
        ordersCount: 1,
        blockedReason: null,
        error: null,
        authority: null,
      });

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.riskAutoExecute).toMatchObject({
      attempted: true,
      executed: true,
      ordersCount: 2,
      cycleId: 'risk-cycle-amd-latest,risk-cycle-samsung-latest',
    });
    expect(vi.mocked(executeAutoRebalanceCycle)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executeAutoRebalanceCycle).mock.calls.map((call) => call[0].cycle.cycleId)).toEqual([
      'risk-cycle-amd-latest',
      'risk-cycle-samsung-latest',
    ]);
  });

  it('drift-check 只有尘埃仓触发止盈止损时不通知也不触发 agent', async () => {
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      policy: {
        execution: { autoGenerateEnabled: false },
        drift: { enabled: true, outerBandPct: 0.05 },
      },
      strategy: {
        constraints: {
          minNotional: 200,
        },
        risk: {
          perAssetStopLossPct: 0.2,
          perAssetTakeProfitPct: 0.25,
        },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: false,
          onRiskTriggered: true,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onRiskTriggered: false,
        },
      },
    }));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce(buildWorkbenchBootstrapFixture({
      account: { cash: 3000, investableCash: 3000, frozenCash: 0, totalEquity: 50000 },
      baseCurrency: 'USD',
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: 'HK::9988.HK',
          symbol: '9988.HK',
          market: 'HK',
          currency: 'HKD',
          holdingQty: 0.00000066,
          holdingPrice: 100,
          lastPrice: 79.2,
          valuationBase: 0.79,
          costBasisInBase: 1,
          unrealizedPnlPct: -20.8,
          actualWeightPct: 0,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
        buildAssetUniverseView({
          assetKey: 'US::MU',
          symbol: 'MU',
          market: 'US',
          currency: 'USD',
          holdingQty: 0.0000000001,
          holdingPrice: 100,
          lastPrice: 156.5,
          valuationBase: 1565,
          costBasisInBase: 1000,
          unrealizedPnlPct: 56.5,
          actualWeightPct: 0,
          targetWeightPct: 0,
          targetWeightHint: 0,
          gapPct: 0,
          fxMissing: false,
        }),
      ],
      marketContext: { regime: 'risk_on', indicators: [], scopes: [] },
      policy: { review: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, outerBandPct: 0.05 } },
      execution: { logs: [] },
      rebalance: {},
      latestCycle: null,
      warnings: [],
    }));

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      driftDetected: false,
      riskTriggeredCount: 0,
      riskIgnoredCount: 2,
      riskTriggerNotified: false,
      riskAgentReview: {
        attempted: false,
        skipped: true,
        reason: 'no actionable risk triggers',
      },
    });
    expect(vi.mocked(runRiskAutopilotDaily)).not.toHaveBeenCalled();
    expect(vi.mocked(sendTelegramByEnv)).not.toHaveBeenCalled();
  });

  it('hf-ingest 在 fallback_seed 时记录 partial job log', async () => {
    vi.mocked(runHumanIngest).mockResolvedValue(buildHumanIngestResult({
      sourceStatus: 'fallback_seed',
      signalCount: 3,
      diagnostics: ['source:seed'],
    }));

    const response = await hfIngestPost(new Request('http://localhost/api/daa/cron/hf-ingest', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.signalCount).toBe(3);
    // hf-ingest 现在使用 runLoggedJob，job 日志通过 jobService 记录
    expect(json.data.jobId).toBeTruthy();
  });

  it('hf-ingest 失败时返回 500', async () => {
    vi.mocked(runHumanIngest).mockRejectedValue(new Error('hf upstream down'));

    const response = await hfIngestPost(new Request('http://localhost/api/daa/cron/hf-ingest', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    expect(json.error.message).toBe('internal server error');
  });

  it('market-indicators-refresh GET 返回刷新结果', async () => {
    const response = await marketIndicatorsRefreshPost(new Request('http://localhost/api/daa/cron/market-indicators-refresh', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      refreshedCount: 3,
      marketContext: {
        regime: 'risk_on',
        scorePct: 66,
      },
    });
    expect(json.data.indicators).toHaveLength(2);
    expect(vi.mocked(refreshMarketIndicators)).toHaveBeenCalledTimes(1);
  });
});
