import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-panel-run-debugger-refactor-v0', () => {
  it('extracts run debugger section and keeps status visible in the summary label', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const debuggerFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanelRunDebuggerV0.tsx');
    const debuggerSource = readFileSync(debuggerFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalancePanelRunDebuggerV0 from './DaaRebalancePanelRunDebuggerV0';");
    expect(panelSource).toContain('<DaaRebalancePanelRunDebuggerV0');
    expect(debuggerSource).toContain('Run debugger · {runStatus}');
    expect(debuggerSource).toContain('One-click diagnostics + guided recovery actions for the current run state.');
  });
});
