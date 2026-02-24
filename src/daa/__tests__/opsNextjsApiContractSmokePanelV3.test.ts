import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v3', () => {
  it('adds v3 contractVersion field and dashboard v3 shortcut label', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('const deterministicKey = `v3-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;');
    expect(route).toContain('const contractVersion = "nextjs-api-contract-v3";');
    expect(route).toContain('smoke: contractVersion,');
    expect(route).toContain('contractVersion,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v3');
  });
});
