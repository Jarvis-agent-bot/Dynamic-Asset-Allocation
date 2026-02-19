import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-analyst-manager-tiering-elite-neutral-incompetent-v0', () => {
  it('shows explicit tier ladder rules for analyst and manager', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain("const tierOf = (score: number) => (score >= 80 ? 'elite' : score >= 50 ? 'neutral' : 'incompetent');");
    expect(source).toContain('tier-ladder: elite >= 80, neutral 50-79, incompetent < 50');
    expect(source).toContain("[{ role: 'Analyst', tier: analystTier, score: analystScore }, { role: 'Manager', tier: managerTier, score: managerScore }].map((r) => (");
    expect(source).toContain('current=<b style={{ color: tierColor(r.tier) }}>{r.tier}</b> ({r.score})');
  });
});
