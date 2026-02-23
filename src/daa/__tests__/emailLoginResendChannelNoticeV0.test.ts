import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mainline-dod-sends-email-via-resend-v4-e-delegate-no-pr-recovery-v2', () => {
  it('returns resendChannelReady/cooldownActive and surfaces user-visible notices', () => {
    const handlerSource = fs.readFileSync(
      path.join(process.cwd(), 'app/api/daa/auth/email-login/_lib/emailLoginRequestHandlerV0.ts'),
      'utf8'
    );
    const loginSource = fs.readFileSync(
      path.join(process.cwd(), 'app/daa/login/_components/DaaLoginClient.tsx'),
      'utf8'
    );

    expect(handlerSource).toContain('function isResendChannelReadyV0(): boolean');
    expect(handlerSource).toContain('resendChannelReady');
    expect(handlerSource).toContain('cooldownActive: true');
    expect(handlerSource).toContain('retryAfterSeconds');
    expect(loginSource).toContain('const resendChannelReady = json?.resendChannelReady !== false;');
    expect(loginSource).toContain('if (json?.cooldownActive === true) {');
    expect(loginSource).toContain('A code was just sent. Please wait');
    expect(loginSource).toContain('Email delivery channel is not configured. Request was accepted, but verification emails may not arrive yet.');
    expect(loginSource).toContain('<AlertTitle>Email delivery notice</AlertTitle>');
  });
});
