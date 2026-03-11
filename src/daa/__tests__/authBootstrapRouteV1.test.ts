import { beforeEach, describe, expect, it } from 'vitest';

import { POST as bootstrapPost } from '@/app/api/daa/auth/bootstrap/route';

import { DAA_AUTH_SESSION_COOKIE_V0 } from '../auth/daaAuthConstantsV0';
import {
  bootstrapCreateFirstDaaAuthAccountV0,
  createDaaAuthSessionV0,
} from '../auth/daaAuthStoreV0';

const PG_GLOBAL_KEY = '__daa_pg_state_v0__';
const STORE_PG_GLOBAL_KEY = '__daa_store_pg_state_v0__';

function resetPgMem() {
  process.env.DAA_PG_MEM = '1';
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_PG_GLOBAL_KEY];
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
}

async function createEditorSessionCookie() {
  const account = await bootstrapCreateFirstDaaAuthAccountV0({
    username: 'admin',
    password: 'pw-admin',
    roles: ['editor'],
  });
  const session = await createDaaAuthSessionV0({
    accountId: account.accountId,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return `${DAA_AUTH_SESSION_COOKIE_V0}=${encodeURIComponent(session.token)}`;
}

beforeEach(() => {
  resetPgMem();
  delete process.env.DAA_AUTH_BOOTSTRAP_TOKEN;
});

describe('auth-bootstrap-route-v1', () => {
  it('缺少首个管理员 bootstrap token 时返回 500', async () => {
    const response = await bootstrapPost(new Request('http://localhost/api/daa/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pw-1' }),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'missing DAA_AUTH_BOOTSTRAP_TOKEN (required for first-admin bootstrap)',
      },
    });
  });

  it('首个管理员 bootstrap token 错误时返回 401', async () => {
    process.env.DAA_AUTH_BOOTSTRAP_TOKEN = 'boot-1';

    const response = await bootstrapPost(new Request('http://localhost/api/daa/auth/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ username: 'admin', password: 'pw-1' }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('DaaBootstrap');
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'unauthorized',
      },
    });
  });

  it('已有账号但未登录 editor 会话时禁止继续 bootstrap', async () => {
    await bootstrapCreateFirstDaaAuthAccountV0({
      username: 'admin',
      password: 'pw-admin',
      roles: ['editor'],
    });

    const response = await bootstrapPost(new Request('http://localhost/api/daa/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ops', password: 'pw-ops', roles: ['viewer'] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'unauthorized',
      },
    });
  });

  it('已有账号时 editor 会话可以创建新账号', async () => {
    const cookie = await createEditorSessionCookie();

    const response = await bootstrapPost(new Request('http://localhost/api/daa/auth/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ username: 'ops', password: 'pw-ops', roles: ['viewer'] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      data: {
        account: {
          username: 'ops',
        },
      },
    });
    expect(json.data.account.roles).toContain('viewer');
  });

  it('已有账号时重复创建同名用户返回 409', async () => {
    const cookie = await createEditorSessionCookie();

    const response = await bootstrapPost(new Request('http://localhost/api/daa/auth/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: JSON.stringify({ username: 'admin', password: 'pw-dup', roles: ['viewer'] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('VALIDATION_FAILED');
    expect(String(json.error.message).toLowerCase()).toContain('unique');
  });
});
