import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('refactor-auto-ui-dead-code-cleanup-v0', () => {
  it('renders revoked session metadata in dashboard settings', () => {
    const file = resolve(process.cwd(), 'app/daa/dashboard/_tabs/DaaSettingsTab.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('Revoked');
    expect(source).toContain('{me.session.revokedAt ?? "-"}');
  });
});
