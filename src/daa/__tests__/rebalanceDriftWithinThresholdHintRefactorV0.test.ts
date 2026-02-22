import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-drift-within-threshold-hint-refactor-v0', () => {
  it('extracts within-threshold hint and shows breach count in message', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const hintFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceDriftWithinThresholdHintV0.tsx');
    const hintSource = readFileSync(hintFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceDriftWithinThresholdHintV0 from './DaaRebalanceDriftWithinThresholdHintV0';");
    expect(panelSource).toContain('<DaaRebalanceDriftWithinThresholdHintV0 breachCount={paperRunDriftAlert.breaches.length} />');
    expect(hintSource).toContain('Drift is within threshold ({breachCount} breaches).');
  });
});
