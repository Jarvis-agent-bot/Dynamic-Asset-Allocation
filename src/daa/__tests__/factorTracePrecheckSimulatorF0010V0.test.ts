import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-auto-factor-trace-precheck-simulator-f0010-v0', () => {
  it('adds a factor-trace transparency precheck simulator with row-level verdicts', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Factor-trace precheck simulator (transparency)');
    expect(source).toContain("const verdict = totalPenalty >= 0.2 ? 'blocked' : totalPenalty >= 0.1 ? 'review' : 'ready';");
    expect(source).toContain("const confidence = r.quality >= 0.9 ? 'high' : r.quality >= 0.8 ? 'medium' : 'low';");
  });
});
