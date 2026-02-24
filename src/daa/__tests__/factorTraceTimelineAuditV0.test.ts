import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-timeline-audit-f0005-v0', () => {
  it('adds factor-trace transparency audit timeline with stage-by-stage evidence', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Factor-trace transparency audit timeline');
    expect(source).toContain('T0 input snapshot: rows=<b>{qatRows.length}</b>');
    expect(source).toContain('T2 dominance audit: dominant gate=<b>{dominantGate}</b> · share=<b>{dominantGateSharePct.toFixed(1)}%</b>');
    expect(source).toContain("T3 operator action: <b>{dominantGate === 'drift' ? 'review drift thresholds first' : dominantGate === 'missing' ? 'backfill missing prices first' : 'refresh stale close prices first'}</b>");
  });
});
