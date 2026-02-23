import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v0', () => {
  it('adds deterministic api contract smoke route and dashboard shortcut', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const API_CONTRACT_SMOKE_ITEMS_V0');
    expect(route).toContain('smoke: "nextjs-api-contract-v0"');
    expect(route).toContain('[DAA][ApiContractSmoke] PASS');
    expect(route).toContain('checks: API_CONTRACT_SMOKE_ITEMS_V0');

    expect(dashboard).toContain('Smoke check shortcuts');
    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke');
  });
});
