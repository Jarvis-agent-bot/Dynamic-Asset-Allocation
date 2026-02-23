import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-prod-smoke-gate-broadcast-v0', () => {
  it('adds deterministic prod smoke gate fail line when engine health or dashboard probe fails', () => {
    const file = resolve(process.cwd(), 'app/api/daa/analysis/market-digest/route.ts');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('fetchProdSmokeProbeV0(`${origin}/api/daa/engine-health`, smokeTimeoutMs)');
    expect(source).toContain('fetchProdSmokeProbeV0(`${origin}/daa/dashboard`, smokeTimeoutMs)');
    expect(source).toContain('failedProdSmokeGates');
    expect(source).toContain('- [DAA][ProdSmokeGate] FAIL');
    expect(source).toContain('prodSmokeGate: {');
  });
});
