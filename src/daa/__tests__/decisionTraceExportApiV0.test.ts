import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('feature-decision-trace-export-api-v0', () => {
  it('adds decision trace export api and dashboard download entry', () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), 'app/api/daa/decision-trace-export/route.ts'),
      'utf8'
    );
    const dashboardSource = fs.readFileSync(
      path.join(process.cwd(), 'app/daa/dashboard/_components/DaaDashboardOverviewCards.tsx'),
      'utf8'
    );

    expect(routeSource).toContain('export async function GET(req: Request)');
    expect(routeSource).toContain('buildTargetedDecisionTransparencyV0');
    expect(routeSource).toContain('slice: requestedSlice');
    expect(routeSource).toContain('content-disposition');
    expect(routeSource).toContain('decision-trace-');

    expect(dashboardSource).toContain('Smoke check shortcuts');
    expect(dashboardSource).toContain('href="/api/daa/decision-trace-export?slice=AAA"');
    expect(dashboardSource).toContain('Download decision trace');
  });
});
