import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-risk-envelope-visualizer-v0', () => {
  it('adds dynamic rebalance risk-envelope visualizer with envelope status per symbol', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('const envelopeLower = -(maxInThreshold + 0.01);');
    expect(source).toContain('const envelopeUpper = maxOutThreshold + 0.01;');
    expect(source).toContain("const envelopeStatus = drift < envelopeLower || drift > envelopeUpper ? 'outside-envelope' : 'inside-envelope';");
    expect(source).toContain('Rebalance risk-envelope visualizer (dynamic decision bounds)');
    expect(source).toContain('envelope=[{(r.envelopeLower * 100).toFixed(1)}%, {(r.envelopeUpper * 100).toFixed(1)}%] · drift={(r.drift * 100).toFixed(1)}% => <b>{r.envelopeStatus}</b>');
  });
});
