import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-wqat-contract-smoke-f0023-v0', () => {
  it('adds a contract smoke guard for W_qat formula explainability', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('W_qat formula contract smoke guard (explainability)');
    expect(source).toContain('const wQatExplainabilityContractSmokeFailCount = wQatExplainabilityContractSmokeRows.filter((row) => row.contractSmokeFailed).length;');
    expect(source).toContain("status=<b>{row.contractSmokeFailed ? 'fail' : 'pass'}</b>");
    expect(source).toContain("contract smoke verdict: fails=<b>{wQatExplainabilityContractSmokeFailCount}/{wQatExplainabilityContractSmokeRows.length}</b> · mode=<b>{wQatExplainabilityContractSmokeFailCount > 0 ? 'wqat-formula-contract-review-required' : 'wqat-formula-contract-stable'}</b>");
  });
});
