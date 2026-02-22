import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-black-swan-consensus-warning-v0', () => {
  it('keeps the analyst-consensus early warning card when defense signals cluster', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelExtraInsightsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Analyst-consensus shift early-warning');
    expect(source).toContain('Combine consensus and concentration cues to flag early regime-risk shifts.');
    expect(source).toContain('const consensusDefense = defenseVotes >= 2;');
    expect(source).toContain("consensusDefense ? 'defense shift detected' : 'stable risk posture'");
    expect(source).toContain('defense votes {defenseVotes}/3');
    expect(source).toContain('Stage defensive rebalance routing');
  });
});
