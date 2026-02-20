import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-recommender-only-no-auto-execution-v0', () => {
  it('keeps Funds hub execution CTA in dry-run mode with explicit recommender-only copy', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('AI recommender-only: no auto trade execution. Dry run only records orders to local execution log.');
    expect(source).toContain("{paperRunLoading ? 'Running...' : 'Run rebalance (dry run)'}");
    expect(source).not.toContain('Run rebalance (live)');
  });
});
