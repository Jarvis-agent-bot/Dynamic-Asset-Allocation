import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-drift-alert-f0037-v0', () => {
  it('adds critical alert and escalation-lane telemetry to guardrail drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const guardrailCriticalDriftCount = guardrailDriftAlertRows.filter((row) => row.pressure === 'critical').length;");
    expect(source).toContain("const guardrailDriftEscalationLane = guardrailDriftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{guardrailDriftAlertCount}/{guardrailDriftAlertRows.length}</b> · mode=<b>{guardrailDriftAlertCount > 0 ? 'guardrail-remediation-required' : 'guardrail-flow-stable'}</b> · readiness=<b>{guardrailDriftReadinessPct}%</b> · route=<b>{guardrailDriftRouteMode}</b> · critical alerts=<b>{guardrailCriticalDriftCount}</b> · escalation lane=<b>{guardrailDriftEscalationLane}</b>");
  });
});
