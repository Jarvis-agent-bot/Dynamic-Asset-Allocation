import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-timeline-audit-f0029-v0', () => {
  it('adds timeline telemetry row for manual confirmation checkpoint audit', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const manualPrecheckReadinessPct = manualConfirmationPrecheckSimulator.length');
    expect(source).toContain('T5 timeline telemetry: readiness=<b>{manualPrecheckReadinessPct}%</b> · route=<b>{manualPrecheckRouteMode}</b>');
  });
});
