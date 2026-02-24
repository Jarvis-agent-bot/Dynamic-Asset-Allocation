import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-wqat-timeline-audit-f0008-v0', () => {
  it('adds an audit timeline for W_qat formula explainability', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelDecisionCardsV0.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('W_qat formula explainability audit timeline');
    expect(source).toContain('const formulaAuditTimeline = [');
    expect(source).toContain('T0 formula inputs: rows=${qatRows.length} avg-quality=${avgQuality.toFixed(3)} avg-tier=${avgAnalystMultiplier.toFixed(3)}');
    expect(source).toContain("T3 explainability action: ${avgNetMultiplier < 0.8 ? 'inspect gate penalties before routing execution' : 'formula signal stable for routing review'}");
    expect(source).toContain("timeline verdict: <b>{avgNetMultiplier < 0.8 ? 'requires-formula-review' : 'formula-ready-for-routing'}</b>");
  });
});
