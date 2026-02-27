import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ui-refactor-dashboard-settings-shadcn-p2-v0', () => {
  it('uses shadcn alert blocks for settings security and safety guidance', () => {
    const file = resolve(process.cwd(), 'app/daa/dashboard/_tabs/DaaSettingsTab.tsx');
    const source = readFileSync(file, 'utf8');

    expect(source).toContain('from "@/components/ui/alert"');
    expect(source).toContain('<AlertTitle>Security</AlertTitle>');
    expect(source).toContain('<AlertTitle>Safety</AlertTitle>');
  });
});
