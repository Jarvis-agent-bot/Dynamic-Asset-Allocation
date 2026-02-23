import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v2', () => {
  it('adds deterministic v2 key and dashboard v2 label for API contract smoke panel', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('smoke: "nextjs-api-contract-v2"');
    expect(route).toContain('const statusTag = summary.fail === 0 ? "PASS" : "FAIL";');
    expect(route).toContain('const deterministicKey = `v2-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;');
    expect(route).toContain('deterministicKey,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v2');
  });
});
