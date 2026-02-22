import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-rebalance-engine-notes-refactor-v0', () => {
  it('extracts engine notes and shows count in the summary title', () => {
    const panelFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalancePanel.tsx');
    const panelSource = readFileSync(panelFile, 'utf8');
    const notesFile = resolve(process.cwd(), 'app/daa/market/funds/_components/DaaRebalanceEngineNotesV0.tsx');
    const notesSource = readFileSync(notesFile, 'utf8');

    expect(panelSource).toContain("import DaaRebalanceEngineNotesV0 from './DaaRebalanceEngineNotesV0';");
    expect(panelSource).toContain('<DaaRebalanceEngineNotesV0 notes={effectiveEngineNotes} />');
    expect(notesSource).toContain('Engine notes ({notes.length})');
  });
});
