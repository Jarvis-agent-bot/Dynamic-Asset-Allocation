import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v6', () => {
  it('upgrades api-contract smoke shortcut to v7 real probes', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const API_CONTRACT_SMOKE_ITEMS_V0');
    expect(route).toContain('for (const probe of API_CONTRACT_SMOKE_ITEMS_V0)');
    expect(route).toContain('if (!result.ok) break;');
    expect(route).toContain('smoke: "nextjs-api-contract-v7-real-probes"');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v7 (real probes)');
  });
});
