import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-run-debugger-summary-refactor-v0', () => {
  it('extracts run debugger summary and exposes blocker count in summary text', () => {
    const debuggerFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelRunDebuggerV0.tsx');
    const debuggerSource = readFileSync(debuggerFile, 'utf8');
    const summaryFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceRunDebuggerSummaryV0.tsx');
    const summarySource = readFileSync(summaryFile, 'utf8');

    expect(debuggerSource).toContain("import DaaRebalanceRunDebuggerSummaryV0 from './DaaRebalanceRunDebuggerSummaryV0';");
    expect(debuggerSource).toContain('<DaaRebalanceRunDebuggerSummaryV0 runStatus={runStatus} blockerCount={blockerCount} />');
    expect(summarySource).toContain('Run debugger · {runStatus} · blockers {blockerCount}');
  });
});
