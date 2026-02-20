import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mainline-goal-enforce-guardrail-first-execution-v0', () => {
  it('adds a user-visible guardrail-first execution gate', () => {
    const file = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Guardrail-first execution gate');
    expect(source).toContain('Execution is permitted only after guardrails pass; otherwise route to remediation first.');
    expect(source).toContain('const canExecute = guardrailBlockers.length === 0 && !preTradeCashCheck.blocking;');
    expect(source).toContain("canExecute ? 'ready-to-execute' : 'blocked-by-guardrails'");
    expect(source).toContain('Resolve guardrails in preflight');
    expect(source).toContain('Hold execution and review orders');
  });
});
