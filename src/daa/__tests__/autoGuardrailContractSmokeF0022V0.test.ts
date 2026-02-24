import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-guardrail-contract-smoke-f0022-v0', () => {
  it('adds a contract smoke guard for guardrail-first decision flow', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Guardrail contract smoke guard (decision flow)');
    expect(source).toContain("const guardrailContractSmokeFailCount = guardrailContractSmokeRows.filter((row) => row.contractSmokeFailed).length;");
    expect(source).toContain("status=<b>{row.contractSmokeFailed ? 'fail' : 'pass'}</b>");
    expect(source).toContain("contract smoke verdict: fails=<b>{guardrailContractSmokeFailCount}/{guardrailContractSmokeRows.length}</b> · mode=<b>{guardrailContractSmokeFailCount > 0 ? 'guardrail-contract-review-required' : 'guardrail-contract-stable'}</b>");
  });
});
