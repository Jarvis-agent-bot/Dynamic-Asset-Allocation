import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-timeline-audit-f0069-v0', () => {
  it('adds pressure-mode telemetry to manual confirmation timeline row', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualTimelinePressureMode = manualTimelineCriticalCount === 0");
    expect(source).toContain('T5 timeline telemetry: readiness=<b>{manualPrecheckReadinessPct}%</b> · route=<b>{manualPrecheckRouteMode}</b> · critical gates=<b>{manualTimelineCriticalCount}</b> · escalation lane=<b>{manualTimelineEscalationLane}</b> · pressure mode=<b>{manualTimelinePressureMode}</b>');
  });
});
