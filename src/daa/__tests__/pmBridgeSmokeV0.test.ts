import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('feature-pm-bridge-smoke-v0', () => {
  it('adds PM bridge smoke route and dashboard shortcut for proposal admission path', () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), 'app/api/daa/pm-bridge-smoke/route.ts'),
      'utf8'
    );
    const dashboardSource = fs.readFileSync(
      path.join(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'),
      'utf8'
    );

    expect(routeSource).toContain('const PM_BRIDGE_SMOKE_REQUEST_V0 =');
    expect(routeSource).toContain('smoke: "pm-bridge-proposal-admission-v0"');
    expect(routeSource).toContain('admittedSignals');
    expect(routeSource).toContain('rejectedSignals');
    expect(routeSource).toContain('upstreamPath: "/daa-api/v1/rebalance/simulate"');

    expect(dashboardSource).toContain('Smoke check shortcuts');
    expect(dashboardSource).toContain('href="/api/daa/pm-bridge-smoke"');
    expect(dashboardSource).toContain('PM bridge admission');
  });
});
