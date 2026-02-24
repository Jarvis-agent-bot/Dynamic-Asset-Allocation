import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-wqat-drift-alert-f0018-v0', () => {
  it('adds a drift alert view for W_qat formula explainability', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('W_qat formula drift alert view (explainability)');
    expect(source).toContain("const wQatFormulaDriftAlertCount = wQatFormulaDriftAlertRows.filter((row) => row.driftAlert).length;");
    expect(source).toContain("status=<b>{row.driftAlert ? 'alert' : 'clear'}</b>");
    expect(source).toContain("drift alert verdict: alerts=<b>{wQatFormulaDriftAlertCount}/{wQatFormulaDriftAlertRows.length}</b> · mode=<b>{wQatFormulaDriftAlertCount > 0 ? 'formula-drift-review-required' : 'formula-drift-stable'}</b>");
  });
});
