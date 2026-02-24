import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-ai-recommender-manual-confirmation-checkpoint-v1', () => {
  it('adds simulation-only fallback note when manual checkpoint is not confirmed', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Without manual confirmation, recommendations stay in simulation-only mode.');
  });
});
