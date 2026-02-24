import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-buy-gate-contract-smoke-f0021-v0', () => {
  it('adds a contract smoke guard for buy gate prechecks', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Buy gate contract smoke guard (precheck)');
    expect(source).toContain("const buyGateContractSmokeFailCount = buyGateContractSmokeRows.filter((row) => row.contractSmokeFailed).length;");
    expect(source).toContain("status=<b>{row.contractSmokeFailed ? 'fail' : 'pass'}</b>");
    expect(source).toContain("contract smoke verdict: fails=<b>{buyGateContractSmokeFailCount}/{buyGateContractSmokeRows.length}</b> · mode=<b>{buyGateContractSmokeFailCount > 0 ? 'buy-gate-contract-review-required' : 'buy-gate-contract-stable'}</b>");
  });
});
