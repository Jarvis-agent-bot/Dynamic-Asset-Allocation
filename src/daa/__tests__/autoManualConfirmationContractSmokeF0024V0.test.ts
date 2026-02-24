import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-manual-confirmation-contract-smoke-f0024-v0', () => {
  it('adds a contract smoke guard for manual confirmation checkpoints', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Manual confirmation contract smoke guard (checkpoint)');
    expect(source).toContain('const manualConfirmationContractSmokeFailCount = manualConfirmationContractSmokeRows.filter((row) => row.contractSmokeFailed).length;');
    expect(source).toContain("status=<b>{row.contractSmokeFailed ? 'fail' : 'pass'}</b>");
    expect(source).toContain("contract smoke verdict: fails=<b>{manualConfirmationContractSmokeFailCount}/{manualConfirmationContractSmokeRows.length}</b> · mode=<b>{manualConfirmationContractSmokeFailCount > 0 ? 'manual-confirmation-contract-review-required' : 'manual-confirmation-contract-stable'}</b>");
  });
});
