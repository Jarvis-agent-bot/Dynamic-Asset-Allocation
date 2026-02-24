import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-thesis-regime-drift-alert-timeline-v4', () => {
  it('adds timeline action trace to thesis-regime drift alert rows', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const timelineAction = !r.thesisRegimeDrift");
    expect(source).toContain("? 'monitor'");
    expect(source).toContain("? 'escalate'");
    expect(source).toContain('timeline action=<b>{timelineAction}</b>');
  });
});
