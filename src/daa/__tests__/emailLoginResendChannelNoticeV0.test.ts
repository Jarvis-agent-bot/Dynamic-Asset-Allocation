import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mainline-dod-sends-email-via-resend-v4-e-delegate-no-pr-recovery-v5', () => {
  it('returns cooldownUntilIso and shows a cooldown-until hint in user notice', () => {
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
    expect(handlerSource).toContain('cooldownUntilIso');
    expect(loginSource).toContain('const resendChannelReady = json?.resendChannelReady !== false;');
    expect(loginSource).toContain('const cooldownActive = json?.cooldownActive === true;');
    expect(loginSource).toContain('formatClockTimeV0');
    expect(loginSource).toContain('json?.cooldownUntilIso');
    expect(loginSource).toContain('A code was just sent. Please wait');
    expect(loginSource).toContain('toast("A code was already sent recently. Cooldown is still active.");');
    expect(loginSource).toContain('cooldownActive?: boolean');
    expect(loginSource).toContain('otp.cooldownActive');
    expect(loginSource).toContain('A code was already sent recently to');
    expect(loginSource).toContain('Email delivery channel is not configured. Request was accepted, but verification emails may not arrive yet.');
    expect(loginSource).toContain('<AlertTitle>Email delivery notice</AlertTitle>');
  });
});
