import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIntegratedDecisionWorkbenchRowV0 } from '../integratedDecisionWorkbenchV0';

describe('uiux-daa-integrated-decision-workbench-v0', () => {
  it('maps tag/threshold/suggestion/risk in one row for operator workbench', () => {
    const result = buildIntegratedDecisionWorkbenchRowV0({
      id: 'AAA',
      targetPct: 0.2,
      deltaPct: -0.03,
      thresholdPct: 0.02,
      isMissingPrice: false,
      isStalePrice: false,
      hasGuardrailBlocker: false,
    });

    expect(result.humanTag).toBe('trusted');
    expect(result.thresholdStatus).toBe('breach');
    expect(result.suggestion).toBe('buy');
    expect(result.riskConstraint).toBe('ok');
  });

  it('shows integrated decision workbench card in extra insights', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx'),
      'utf8'
    );

    expect(source).toContain("import { buildIntegratedDecisionWorkbenchRowV0 } from '@/src/daa/integratedDecisionWorkbenchV0';");
    expect(source).toContain('Integrated DAA decision workbench');
    expect(source).toContain('Human tag, threshold status, buy/sell suggestion, and risk constraint are shown on one screen.');
    expect(source).toContain('tag=<b>{r.humanTag}</b> · threshold=<b>{r.thresholdStatus}</b> · suggestion=<b>{r.suggestion}</b> · risk=<b');
  });
});
