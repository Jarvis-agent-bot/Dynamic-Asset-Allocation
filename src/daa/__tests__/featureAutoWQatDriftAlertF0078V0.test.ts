import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-drift-alert-f0078-v0', () => {
  it('adds review-priority telemetry to W_qat drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const wQatFormulaDriftReviewPriority = wQatFormulaDriftPressureMode === 'critical-pressure'");
    expect(source).toContain("drift alert verdict: alerts=<b>{wQatFormulaDriftAlertCount}/{wQatFormulaDriftAlertRows.length}</b> · mode=<b>{wQatFormulaDriftAlertCount > 0 ? 'formula-drift-review-required' : 'formula-drift-stable'}</b> · readiness=<b>{wQatFormulaDriftReadinessPct}%</b> · route=<b>{wQatFormulaDriftRouteMode}</b> · critical alerts=<b>{wQatFormulaCriticalDriftCount}</b> · escalation lane=<b>{wQatFormulaDriftEscalationLane}</b> · pressure mode=<b>{wQatFormulaDriftPressureMode}</b> · review priority=<b>{wQatFormulaDriftReviewPriority}</b>");
  });
});
