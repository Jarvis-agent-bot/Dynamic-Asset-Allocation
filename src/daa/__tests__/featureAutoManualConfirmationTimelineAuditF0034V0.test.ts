import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-timeline-audit-f0034-v0', () => {
  it('adds checkpoint gate-check stage to manual confirmation audit timeline', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const manualTimelineVerdictMode = manualCheckpointConfirmed ? 'checkpoint-cleared-for-execution-review' : 'awaiting-manual-confirmation';");
    expect(source).toContain('T4 checkpoint gate check: blocked gates=<b>{manualPrecheckBlockedCount}/{manualConfirmationPrecheckSimulator.length}</b> · route mode=<b>{manualPrecheckRouteMode}</b>');
    expect(source).toContain('timeline verdict: <b>{manualTimelineVerdictMode}</b>');
  });
});
