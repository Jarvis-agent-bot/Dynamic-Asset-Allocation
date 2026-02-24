import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-ai-recommender-manual-confirmation-checkpoint-v3', () => {
  it('adds explicit execution suggestion mode trace for manual checkpoint lock state', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Execution suggestion mode: <b>{manualCheckpointConfirmed ? \'unlocked (manual gate open)\' : \'locked (simulation-only)\'}</b>');
    expect(source).toContain("Manual checkpoint status: <b>{manualCheckpointConfirmed ? 'confirmed' : 'not confirmed'}</b>");
  });
});
