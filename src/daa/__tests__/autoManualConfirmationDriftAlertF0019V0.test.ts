import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('feature-auto-manual-confirmation-drift-alert-f0019-v0', () => {
  it('adds a drift alert view for manual confirmation checkpoints', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx'),
      'utf8',
    );

    expect(source).toContain('Manual confirmation drift alert view (checkpoint)');
    expect(source).toContain("const manualConfirmationDriftAlertCount = manualConfirmationDriftAlertRows.filter((row) => row.driftAlert).length;");
    expect(source).toContain("status=<b>{row.driftAlert ? 'alert' : 'clear'}</b>");
    expect(source).toContain("drift alert verdict: alerts=<b>{manualConfirmationDriftAlertCount}/{manualConfirmationDriftAlertRows.length}</b> · mode=<b>{manualConfirmationDriftAlertCount > 0 ? 'manual-confirmation-required' : 'checkpoint-flow-stable'}</b>");
  });
});
