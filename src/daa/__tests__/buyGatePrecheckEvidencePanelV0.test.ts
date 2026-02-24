import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-buy-gate-evidence-panel-f0001-v0', () => {
  it('renders an evidence panel summary for buy gate prechecks', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Buy gate precheck evidence panel: blocked rows=<b>{evidencePanel.blockedRows}/{precheckRows.length}</b>');
    expect(source).toContain('incompetence hits=<b>{evidencePanel.incompetenceHits}</b>');
    expect(source).toContain('top blocker evidence: <b>{topEvidence.id}</b>');
    expect(source).toContain('unblock next=<b>{topEvidence.unblockHint}</b>');
  });
});
