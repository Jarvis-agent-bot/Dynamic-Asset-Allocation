import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-analyst-logic-consistency-alerts-v0', () => {
  it('adds a user-visible divergence alert between analyst thesis and environment regime', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Analyst logic-consistency alerts');
    expect(source).toContain('Flag divergence between analyst thesis and environment regime.');
    expect(source).toContain("const analystThesis = netDeltaNotional >= 0 ? 'risk-on' : 'risk-off';");
    expect(source).toContain("const regime = envStressScore >= 40 ? 'risk-off' : 'risk-on';");
    expect(source).toContain("status=<b style={{ color: diverged ? 'var(--danger)' : '#16a34a' }}>{diverged ? 'diverged' : 'aligned'}</b>");
    expect(source).toContain('Recheck market regime inputs');
  });
});
