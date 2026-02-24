import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-ai-recommender-manual-confirmation-checkpoint-v2', () => {
  it('locks execution-suggestion buttons until the manual checkpoint is confirmed', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Manual checkpoint status:');
    expect(source).toContain('disabled={!manualCheckpointConfirmed}');
    expect(source).toContain('setManualCheckpointConfirmed(true);');
    expect(source).toContain('Confirm manual checkpoint before applying execution suggestions.');
  });
});
