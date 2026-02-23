import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ops-nextjs-api-contract-smoke-panel-v1', () => {
  it('adds deterministic pass/fail summary payload and v1 dashboard smoke entry', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/daa/api-contract-smoke/route.ts'), 'utf8');
    const dashboard = readFileSync(resolve(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'), 'utf8');

    expect(route).toContain('type ApiContractSmokeSummaryV1 =');
    expect(route).toContain('smoke: "nextjs-api-contract-v1"');
    expect(route).toContain('const summary: ApiContractSmokeSummaryV1 =');
    expect(route).toContain('passRatePct');
    expect(route).toContain('summaryLine: `[DAA][ApiContractSmoke] ${summary.fail === 0 ? "PASS" : "FAIL"}');
    expect(route).toContain('summary,');

    expect(dashboard).toContain('href="/api/daa/api-contract-smoke"');
    expect(dashboard).toContain('API contract smoke v1');
  });
});
