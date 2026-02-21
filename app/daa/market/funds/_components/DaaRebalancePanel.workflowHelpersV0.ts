import {
  DAA_FUNDS_HUB_REFRESH_MARKET_DONE_EVENT,
  DAA_FUNDS_HUB_REFRESH_MARKET_EVENT,
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT,
  DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT,
  LS_REBALANCE_REQUEST,
  LS_REBALANCE_RESPONSE,
  WIZARD_DATA_EVENT,
} from '../../../wizardStorage';
import { LS_LEGACY_HOLDINGS, savePortfolioStateV1 } from '../../../portfolioStateStore';
import { savePriceSnapshotV1 } from '../../../priceSnapshotStore';
import { persistTargetWeightsV1 } from '../../../targetWeightsStore';
import { scrollToId } from './DaaRebalancePanel.helpersV0';

type SampleStatus = 'idle' | 'ok' | 'error';
type RunDaaStatus = 'idle' | 'running' | 'ok' | 'error';

export async function applySampleScenarioV0(args: {
  setSampleStatus: (status: SampleStatus) => void;
  setOpen: (open: boolean) => void;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  const ok = window.confirm(
    'Load sample scenario v0? This will overwrite local demo data (portfolio, price snapshot, targetWeights) and clear last rebalance request/response.'
  );
  if (!ok) return;

  try {
    const at = new Date().toISOString();
    const legacyHoldings = {
      '005963': { share: 1000, cost: 1.2 },
      '007300': { share: 500, cost: 1.0 },
    };

    window.localStorage.setItem(LS_LEGACY_HOLDINGS, JSON.stringify(legacyHoldings));
    savePortfolioStateV1({
      schemaVersion: 1,
      updatedAt: at,
      cash: 1000,
      positions: {
        '005963': { qty: 1000, cost: 1.2 },
        '007300': { qty: 500, cost: 1.0 },
      },
    });
    savePriceSnapshotV1({
      schemaVersion: 1,
      updatedAt: at,
      prices: {
        '005963': { price: 1.234 },
        '007300': { price: 1.052 },
        '000001': { price: 1.4 },
      },
    });
    persistTargetWeightsV1([
      { id: '005963', label: '005963', targetPct: 0.4 },
      { id: '007300', label: '007300', targetPct: 0.3 },
      { id: '000001', label: '000001', targetPct: 0.3 },
    ]);

    window.localStorage.removeItem(LS_REBALANCE_REQUEST);
    window.localStorage.removeItem(LS_REBALANCE_RESPONSE);
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
    args.setSampleStatus('ok');
    window.setTimeout(() => args.setSampleStatus('idle'), 1200);
    args.setOpen(true);
    window.setTimeout(() => scrollToId('rebalance'), 50);
  } catch {
    args.setSampleStatus('error');
    window.setTimeout(() => args.setSampleStatus('idle'), 2000);
  }
}

export function jumpToV0(setOpen: (open: boolean) => void, targetId: string): void {
  setOpen(true);
  window.setTimeout(() => scrollToId(targetId), 50);
}

function waitForRunDaaStepV0(eventName: string, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    const onDone = (ev: Event) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.removeEventListener(eventName, onDone as EventListener);
      const detail = (ev as CustomEvent<{ ok: boolean; error?: string }>).detail;
      resolve(detail && typeof detail === 'object' ? detail : { ok: true });
    };
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      window.removeEventListener(eventName, onDone as EventListener);
      resolve({ ok: false, error: 'timeout' });
    }, timeoutMs);
    window.addEventListener(eventName, onDone as EventListener);
  });
}

export async function runDaaRefreshAndRecommendationV0(args: {
  runDaaStatus: RunDaaStatus;
  setOpen: (open: boolean) => void;
  setRunDaaStatus: (status: RunDaaStatus) => void;
  setRunDaaStatusText: (text: string) => void;
  jumpTo: (targetId: string) => void;
}): Promise<void> {
  if (args.runDaaStatus === 'running') return;
  args.setOpen(true);
  args.setRunDaaStatus('running');
  args.setRunDaaStatusText('Refreshing Step2 market sources...');
  window.dispatchEvent(new CustomEvent(DAA_FUNDS_HUB_REFRESH_MARKET_EVENT));
  const refreshResult = await waitForRunDaaStepV0(DAA_FUNDS_HUB_REFRESH_MARKET_DONE_EVENT, 45_000);
  if (!refreshResult.ok) {
    args.setRunDaaStatus('error');
    args.setRunDaaStatusText(`Step2 refresh failed: ${refreshResult.error ?? 'unknown error'}`);
    return;
  }

  args.setRunDaaStatusText('Generating Step4 recommendation...');
  window.dispatchEvent(new CustomEvent(DAA_FUNDS_HUB_RUN_RECOMMENDATION_EVENT));
  const runResult = await waitForRunDaaStepV0(DAA_FUNDS_HUB_RUN_RECOMMENDATION_DONE_EVENT, 45_000);
  if (!runResult.ok) {
    args.setRunDaaStatus('error');
    args.setRunDaaStatusText(`Step4 recommendation failed: ${runResult.error ?? 'unknown error'}`);
    return;
  }

  args.setRunDaaStatus('ok');
  args.setRunDaaStatusText('Run DAA completed: Step2 refreshed and Step4 recommendation updated.');
  args.jumpTo('step4');
  window.setTimeout(() => {
    args.setRunDaaStatus('idle');
    args.setRunDaaStatusText('');
  }, 3000);
}
