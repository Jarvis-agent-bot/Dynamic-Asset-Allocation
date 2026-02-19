import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-analyst-correlation-diversity-check-v0', () => {
  it('adds a visible correlation-diversity check to prevent hidden concentration', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Analyst correlation-diversity check');
    expect(source).toContain('Prevent hidden concentration by checking cross-bucket style diversity.');
    expect(source).toContain("const concentrationRisk = topShare >= 0.55 || bucketCounts.size <= 2;");
    expect(source).toContain("concentrationRisk ? 'hidden concentration risk' : 'diversity acceptable'");
    expect(source).toContain('top correlation bucket share=<b>{(topShare * 100).toFixed(1)}%</b>');
    expect(source).toContain('Stage de-correlation orders');
  });
});
