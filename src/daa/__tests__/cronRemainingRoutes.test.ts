import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { buildSystemConfigRow } from '@/src/daa/__tests__/testDataFactories';

vi.mock('@/src/daa/cron/auth', () => ({
  requireCronAuth: vi.fn(async () => null),
}));

vi.mock('@/src/daa/store/daaStorePg', () => ({
  getDaaSystemConfig: vi.fn(async () => ({
    config: {
      rebalanceStrategy: {
        autoGenerateEnabled: true,
        drift: { enabled: true, thresholdPct: 0.05 },
      },
      notification: {
        dailyAnalysisHourUtc: new Date().getUTCHours(),
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
  appendDaaIngestJobLog: vi.fn(async () => null),
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
    rebalanceStrategy: { calendar: { enabled: true, dayOfMonth: 1 }, drift: { enabled: true, thresholdPct: 0.05 } },
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
import { appendDaaIngestJobLog, getDaaSystemConfig } from '@/src/daa/store/daaStorePg';

function buildDriftConfig(input: {
  autoGenerateEnabled: boolean;
  telegramEnabled?: boolean;
  feishuEnabled?: boolean;
}) {
  return buildSystemConfigRow({
    rebalanceStrategy: {
      autoGenerateEnabled: input.autoGenerateEnabled,
      drift: { enabled: true, thresholdPct: 0.05, checkFrequency: 'daily' },
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
    expect(String(vi.mocked(sendTelegramByEnv).mock.calls[0]?.[0] || '')).toContain('偏移触发');
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
    expect(vi.mocked(appendDaaIngestJobLog)).toHaveBeenCalledWith(expect.objectContaining({
      jobType: 'cron_hf_ingest',
      status: 'partial',
      totalCount: 3,
      successCount: 3,
      failureCount: 1,
      diagnosticsJson: expect.objectContaining({
        sourceStatus: 'fallback_seed',
      }),
    }));
  });

  it('hf-ingest 失败时会记录 failed job log 并返回 500', async () => {
    vi.mocked(runHumanIngest).mockRejectedValue(new Error('hf upstream down'));

    const response = await hfIngestPost(new Request('http://localhost/api/daa/cron/hf-ingest', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    expect(json.error.message).toBe('internal server error');
    expect(vi.mocked(appendDaaIngestJobLog)).toHaveBeenCalledWith(expect.objectContaining({
      jobType: 'cron_hf_ingest',
      status: 'failed',
      failureCount: 1,
      diagnosticsJson: { error: 'hf upstream down' },
    }));
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
