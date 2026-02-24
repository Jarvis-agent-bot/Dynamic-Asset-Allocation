import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v5', () => {
  it('adds deterministic route vector payload and dashboard v5 shortcut', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const deterministicKey = `v5-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;');
    expect(route).toContain('const deterministicRouteVector = API_CONTRACT_SMOKE_ITEMS_V0.map((item) => item.route).join("|");');
    expect(route).toContain('const contractVersion = "nextjs-api-contract-v5";');
    expect(route).toContain('deterministicRouteVector,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v5');
  });
});
