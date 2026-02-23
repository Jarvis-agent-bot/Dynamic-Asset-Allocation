import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mainline-dod-sends-email-via-resend-v4-e-delegate-no-pr-recovery-v11', () => {
  it('shows cooldown-until hint with explicit local-time label in inbox cooldown copy', () => {
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
    expect(loginSource).toContain('function deriveRequestedAtMsFromRetryV0');
    expect(loginSource).toContain('deriveRequestedAtMsFromRetryV0(cooldownSeconds, retryAfterSeconds, nowMs)');
    expect(loginSource).toContain('const resendAvailableAtLabel = otp.kind === "sent" ? formatClockTimeV0(otp.cooldownUntilIso) : null;');
    expect(loginSource).toContain('Resend in ${formatSeconds(cooldownRemainingSeconds)}${resendAvailableAtLabel ? ` (after ${resendAvailableAtLabel})` : ""}');
    expect(loginSource).toContain('function formatClockTimeV0');
    expect(loginSource).toContain('const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();');
    expect(loginSource).toContain('toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })');
    expect(loginSource).toContain('json?.cooldownUntilIso');
    expect(loginSource).toContain('A code was just sent. Please wait');
    expect(loginSource).toContain('local time');
    expect(loginSource).toContain('toast("A code was already sent recently. Cooldown is still active.");');
    expect(loginSource).toContain('cooldownActive?: boolean; cooldownUntilIso?: string');
    expect(loginSource).toContain('cooldownUntilIso: typeof json?.cooldownUntilIso === "string" ? json.cooldownUntilIso : undefined');
    expect(loginSource).toContain('cooldownUntilIso: typeof sent?.cooldownUntilIso === "string" ? sent.cooldownUntilIso : undefined');
    expect(loginSource).toContain('formatClockTimeV0(otp.cooldownUntilIso)');
    expect(loginSource).toContain('A code was already sent recently to');
    expect(loginSource).toContain('(device local time)');
    expect(loginSource).toContain('Email delivery channel is not configured. Request was accepted, but verification emails may not arrive yet.');
    expect(loginSource).toContain('<AlertTitle>Email delivery notice</AlertTitle>');
  });
});
