import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-guardrail-drift-alert-f0042-v0', () => {
  it('adds readiness and route telemetry to guardrail drift alert verdict', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const guardrailDriftReadinessPct = guardrailDriftAlertRows.length');
    expect(source).toContain("const guardrailDriftRouteMode = guardrailDriftAlertCount === 0");
    expect(source).toContain("drift alert verdict: alerts=<b>{guardrailDriftAlertCount}/{guardrailDriftAlertRows.length}</b> · mode=<b>{guardrailDriftAlertCount > 0 ? 'guardrail-remediation-required' : 'guardrail-flow-stable'}</b> · readiness=<b>{guardrailDriftReadinessPct}%</b> · route=<b>{guardrailDriftRouteMode}</b>");
  });
});
