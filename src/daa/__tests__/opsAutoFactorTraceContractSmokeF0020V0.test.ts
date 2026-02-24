import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ops-auto-factor-trace-contract-smoke-f0020-v0', () => {
  it('adds a contract smoke guard for factor-trace transparency', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Factor-trace contract smoke guard (transparency)');
    expect(source).toContain("const factorTraceContractSmokeFailCount = factorTraceContractSmokeRows.filter((row) => row.contractSmokeFailed).length;");
    expect(source).toContain("status=<b>{row.contractSmokeFailed ? 'fail' : 'pass'}</b>");
    expect(source).toContain("contract smoke verdict: fails=<b>{factorTraceContractSmokeFailCount}/{factorTraceContractSmokeRows.length}</b> · mode=<b>{factorTraceContractSmokeFailCount > 0 ? 'contract-review-required' : 'contract-stable'}</b>");
  });
});
