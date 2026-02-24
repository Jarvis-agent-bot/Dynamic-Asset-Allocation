import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-manual-confirmation-evidence-panel-f0004-v0', () => {
  it('adds a manual confirmation evidence panel with checkpoint trace', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("Manual confirmation evidence panel: checkpoint status=<b>{manualCheckpointConfirmed ? 'confirmed' : 'pending'}</b>");
    expect(source).toContain("execution mode=<b>{manualCheckpointConfirmed ? 'live-actionable' : 'simulation-only'}</b>");
    expect(source).toContain("checkpoint evidence trace: next operator action=<b>{manualCheckpointConfirmed ? 'review live order routing' : 'confirm checkpoint and open preflight'}</b>");
  });
});
