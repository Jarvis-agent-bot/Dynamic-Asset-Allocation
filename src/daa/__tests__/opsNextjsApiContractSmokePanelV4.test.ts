import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v4', () => {
  it('adds deterministic v4 contract payload with compatibility matrix and dashboard v4 shortcut', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const deterministicKey = `v4-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;');
    expect(route).toContain('const contractVersion = "nextjs-api-contract-v4";');
    expect(route).toContain('const compatibilityMatrix = {');
    expect(route).toContain('compatibilityMatrix,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v4');
  });
});
