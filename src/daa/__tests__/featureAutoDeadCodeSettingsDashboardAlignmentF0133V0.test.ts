import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('feature-auto-dead-code-settings-dashboard-alignment-f0133-v0', () => {
  it('documents canonical settings route alignment with dashboard session guard behavior', () => {
    const file = resolve(process.cwd(), 'app/daa/dashboard/_tabs/DaaSettingsTab.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Settings stays aligned under <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard/settings</code> so dashboard + settings share the same auth/session guard behavior.');
  });
});
