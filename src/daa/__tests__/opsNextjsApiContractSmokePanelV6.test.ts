import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v6', () => {
  it('adds deterministic contract digest payload and dashboard v6 shortcut', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const deterministicKey = `v6-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;');
    expect(route).toContain('const deterministicContractDigest = API_CONTRACT_SMOKE_ITEMS_V0.map((item) => `${item.key}:${item.status}`).join("|");');
    expect(route).toContain('const contractVersion = "nextjs-api-contract-v6";');
    expect(route).toContain('deterministicContractDigest,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v6');
  });
});
