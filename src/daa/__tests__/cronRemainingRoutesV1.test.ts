import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/src/daa/cron/authV1', () => ({
  requireCronAuthV1: vi.fn(() => null),
}));

vi.mock('@/src/daa/store/daaStorePgV1', () => ({
  getDaaSystemConfigV2: vi.fn(async () => ({
    config: {
      rebalanceStrategy: {
        autoGenerateEnabled: true,
        drift: { enabled: true },
      },
      notification: {
        telegram: {
          enabled: true,
          onDriftTrigger: true,
        },
      },
    },
  })),
  appendDaaIngestJobLogV1: vi.fn(async () => null),
}));

vi.mock('@/src/daa/modules/workbench/workbenchReadServiceV1', () => ({
  buildWorkbenchBootstrapV1: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/src/daa/modules/workbench/workbenchRebalanceCycleServiceV1', () => ({
  generateWorkbenchRebalanceCycleV1: vi.fn(async () => ({
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

vi.mock('@/src/daa/notify/telegramV1', () => ({
  sendTelegramByEnvV1: vi.fn(async () => null),
}));

vi.mock('@/src/daa/hf/hfServiceV1', () => ({
  runHumanIngestV1: vi.fn(async () => ({
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

vi.mock('@/src/daa/modules/marketContext/marketIndicatorServiceV1', () => ({
  refreshMarketIndicatorsV1: vi.fn(async () => ({
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

import { GET as driftCheckGet, POST as driftCheckPost } from '@/app/api/daa/cron/drift-check/route';
import { POST as hfIngestPost } from '@/app/api/daa/cron/hf-ingest/route';
import { GET as marketIndicatorsRefreshGet } from '@/app/api/daa/cron/market-indicators-refresh/route';

import { requireCronAuthV1 } from '@/src/daa/cron/authV1';
import { sendTelegramByEnvV1 } from '@/src/daa/notify/telegramV1';
import { refreshMarketIndicatorsV1 } from '@/src/daa/modules/marketContext/marketIndicatorServiceV1';
import { buildWorkbenchBootstrapV1 } from '@/src/daa/modules/workbench/workbenchReadServiceV1';
import { generateWorkbenchRebalanceCycleV1 } from '@/src/daa/modules/workbench/workbenchRebalanceCycleServiceV1';
import { runHumanIngestV1 } from '@/src/daa/hf/hfServiceV1';
import { appendDaaIngestJobLogV1, getDaaSystemConfigV2 } from '@/src/daa/store/daaStorePgV1';

describe('cron-remaining-routes-v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCronAuthV1).mockReturnValue(null);
  });

  it('drift-check 未通过 cron 鉴权时返回 401', async () => {
    vi.mocked(requireCronAuthV1).mockReturnValue(NextResponse.json({ ok: false }, { status: 401 }));

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
    expect(vi.mocked(buildWorkbenchBootstrapV1)).not.toHaveBeenCalled();
  });

  it('drift-check 在自动生成关闭时返回 skipped', async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
      config: {
        rebalanceStrategy: {
          autoGenerateEnabled: false,
          drift: { enabled: true },
        },
        notification: {
          telegram: { enabled: true, onDriftTrigger: true },
        },
      },
    } as any);

    const response = await driftCheckGet(new Request('http://localhost/api/daa/cron/drift-check', { method: 'GET' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      skipped: true,
      reason: 'auto generate disabled',
    });
    expect(vi.mocked(generateWorkbenchRebalanceCycleV1)).not.toHaveBeenCalled();
  });

  it('drift-check 成功创建周期时会预热 bootstrap 并发送通知', async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
      config: {
        rebalanceStrategy: {
          autoGenerateEnabled: true,
          drift: { enabled: true },
        },
        notification: {
          telegram: { enabled: true, onDriftTrigger: true },
        },
      },
    } as any);

    const response = await driftCheckPost(new Request('http://localhost/api/daa/cron/drift-check', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      skipped: false,
      created: true,
      cycleId: 'cycle-drift-1',
      proposalCount: 2,
    });
    expect(vi.mocked(buildWorkbenchBootstrapV1)).toHaveBeenCalledWith({ syncPrices: false, autoRiskCycle: true });
    expect(vi.mocked(generateWorkbenchRebalanceCycleV1)).toHaveBeenCalledWith({
      triggerSource: 'drift',
      triggerReason: '偏移量阈值触发',
      manual: false,
    });
    expect(vi.mocked(sendTelegramByEnvV1)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(sendTelegramByEnvV1).mock.calls[0]?.[0] || '')).toContain('cycle-drift-1');
  });

  it('hf-ingest 在 fallback_seed 时记录 partial job log', async () => {
    vi.mocked(runHumanIngestV1).mockResolvedValue({
      summary: {
        sourceStatus: 'fallback_seed',
        signalCount: 3,
        diagnostics: { source: 'seed' },
      },
      batch: {
        signals: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        asOfDate: '2026-03-10',
        generatedAt: '2026-03-10T08:00:00.000Z',
      },
    } as any);

    const response = await hfIngestPost(new Request('http://localhost/api/daa/cron/hf-ingest', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.signalCount).toBe(3);
    expect(vi.mocked(appendDaaIngestJobLogV1)).toHaveBeenCalledWith(expect.objectContaining({
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
    vi.mocked(runHumanIngestV1).mockRejectedValue(new Error('hf upstream down'));

    const response = await hfIngestPost(new Request('http://localhost/api/daa/cron/hf-ingest', { method: 'POST' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('INTERNAL_ERROR');
    expect(json.error.message).toBe('hf upstream down');
    expect(vi.mocked(appendDaaIngestJobLogV1)).toHaveBeenCalledWith(expect.objectContaining({
      jobType: 'cron_hf_ingest',
      status: 'failed',
      failureCount: 1,
      diagnosticsJson: { error: 'hf upstream down' },
    }));
  });

  it('market-indicators-refresh GET 返回刷新结果', async () => {
    const response = await marketIndicatorsRefreshGet(new Request('http://localhost/api/daa/cron/market-indicators-refresh', { method: 'GET' }));
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
    expect(vi.mocked(refreshMarketIndicatorsV1)).toHaveBeenCalledTimes(1);
  });
});
