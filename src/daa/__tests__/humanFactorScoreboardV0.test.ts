import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-human-factor-scoreboard-v0', () => {
  it('renders analyst/manager human-factor scoreboard with transparent breakdown and tiers', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Human-factor scoreboard');
    expect(source).toContain('Analyst/manager grades with transparent score breakdown.');
    expect(source).toContain("const tierOf = (score: number) => (score >= 80 ? 'elite' : score >= 50 ? 'neutral' : 'incompetent');");
    expect(source).toContain('100 - ({missingPriceCount} missing×8 + {stalePriceCount} stale×5 + hot drift cap {Math.min(20, driftHotCount * 2)})');
    expect(source).toContain('100 - ({blockerCount} blockers×18 + {warningCount} warnings×5 + cash block {preTradeCashCheck.blocking ? 12 : 0} + run error {paperRunError ? 15 : 0})');
  });
});
