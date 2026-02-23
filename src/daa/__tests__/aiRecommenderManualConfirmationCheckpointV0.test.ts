import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-ai-recommender-manual-confirmation-checkpoint-v0', () => {
  it('adds manual confirmation checkpoint before execution suggestions become actionable', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('AI recommender manual confirmation checkpoint: operator must confirm preflight checkpoint before any execution suggestion is treated as actionable.');
    expect(source).toContain('Confirm manual checkpoint');
  });
});
