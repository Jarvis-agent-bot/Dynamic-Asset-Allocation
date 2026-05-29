import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import {
  buildAssetUniverseView,
  buildSystemConfigRow,
  buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture,
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
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
        feishu: {
          enabled: false,
          onDriftTrigger: false,
          onSuggestionGenerated: false,
          onTradeExecuted: false,
          dailyReport: false,
        },
      },
    },
  })),
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
import { runHumanIngest } from '@/src/daa/hf/hfService';
import { getDaaSystemConfig } from '@/src/daa/store/daaStorePg';
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
      },
      feishu: {
        enabled: input.feishuEnabled ?? false,
        onDriftTrigger: input.feishuEnabled ?? false,
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

  it('drift-check 在自动生成关闭时仍检测偏移并发送通知', async () => {
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
    // Should still detect drift and send notification
    expect(vi.mocked(buildWorkbenchBootstrap)).toHaveBeenCalledWith({ syncPrices: false, autoRiskCycle: true });
    expect(vi.mocked(generateWorkbenchRebalanceCycle)).not.toHaveBeenCalled();
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    const message = String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '');
    expect(message).toContain('DAA 偏移检测通知');
    expect(message).toContain('未生成新周期：自动生成已关闭');
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
    expect(String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '')).toContain('cycle-drift-1');
    expect(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[1]).toMatchObject({
      cycleId: 'cycle-drift-1',
      requestJson: {
        newCycleCreated: true,
        referenceCycleId: null,
      },
    });
  });

  it('drift-check 未创建新周期时发送检测通知但不把旧周期当成本次建议', async () => {
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
        triggerReason: 'Agent 目标权重调仓',
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
      driftTriggerNotified: true,
    });
    expect(vi.mocked(sendTelegramByEnv)).toHaveBeenCalledTimes(1);
    const message = String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '');
    expect(message).toContain('DAA 偏移检测通知');
    expect(message).toContain('未生成新周期：冷静期生效中，24 小时内不重复自动触发');
    expect(message).toContain('参考最近周期: cycle-old-1（非本次生成）');
    expect(message).not.toContain('建议数');
    expect(message).not.toContain('风控');
    expect(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[1]).toMatchObject({
      cycleId: null,
      requestJson: {
        newCycleCreated: false,
        referenceCycleId: 'cycle-old-1',
        generationMessage: '冷静期生效中，24 小时内不重复自动触发',
      },
    });
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
      driftTriggerSkippedReason: 'drift_triggered already delivered today',
    });
    expect(vi.mocked(hasTodayNotification)).toHaveBeenCalledWith('drift_triggered');
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
