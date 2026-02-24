import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-timeline-audit-f0009-v0', () => {
  it('adds an audit timeline for manual confirmation checkpoints', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Manual confirmation checkpoint audit timeline');
    expect(source).toContain('const manualConfirmationTimeline = [');
    expect(source).toContain("T0 checkpoint state=${manualCheckpointConfirmed ? 'confirmed' : 'pending'}");
    expect(source).toContain("T1 execution mode=${manualCheckpointConfirmed ? 'live-actionable' : 'simulation-only'}");
    expect(source).toContain("timeline verdict: <b>{manualCheckpointConfirmed ? 'checkpoint-cleared-for-execution-review' : 'awaiting-manual-confirmation'}</b>");
  });
});
