#!/usr/bin/env node

const base = process.env.DAA_SMOKE_BASE_URL || 'https://exwxyzi.cn';
const timeoutMs = Number.parseInt(process.env.DAA_SMOKE_TIMEOUT_MS || '12000', 10);

function normBase(input) {
  const u = new URL(input);
  u.pathname = '';
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

function fail(fingerprint, detail) {
  throw new Error('fingerprint=' + fingerprint + ' ' + detail);
}

function checkStatus(ok, fingerprint, detail) {
  if (!ok) {
    fail(fingerprint, detail);
  }
}

function snippet(text, limit = 240) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function getText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'text/html',
        'user-agent': 'DAA-Prod-Smoke/1.0',
      },
      redirect: 'follow',
      signal: ctl.signal,
    });
    const text = await resp.text();
    return { resp, text };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'DAA-Prod-Smoke/1.0',
      },
      redirect: 'follow',
      signal: ctl.signal,
    });
    const text = await resp.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { resp, text, json };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const root = normBase(base);

  const dashboard = await getText(root + '/daa/dashboard');
  checkStatus(
    dashboard.resp.status === 200,
    'DAA_SMOKE_DASHBOARD_STATUS',
    '/daa/dashboard status=' + dashboard.resp.status
  );
  checkStatus(
    dashboard.text.toLowerCase().includes('daa') || dashboard.text.toLowerCase().includes('dashboard'),
    'DAA_SMOKE_DASHBOARD_BODY_UNEXPECTED',
    '/daa/dashboard returned unexpected html body=' + snippet(dashboard.text)
  );

  const health = await getJson(root + '/api/daa/engine-health');
  checkStatus(
    health.resp.status === 200,
    'DAA_SMOKE_ENGINE_HEALTH_STATUS',
    '/api/daa/engine-health status=' + health.resp.status + ' body=' + snippet(health.text)
  );
  checkStatus(
    health.json && typeof health.json === 'object',
    'DAA_SMOKE_ENGINE_HEALTH_NON_JSON',
    '/api/daa/engine-health returned non-json payload body=' + snippet(health.text)
  );
  checkStatus(
    typeof health.json.ok === 'boolean',
    'DAA_SMOKE_ENGINE_HEALTH_MISSING_OK',
    '/api/daa/engine-health missing boolean ok field body=' + snippet(health.text)
  );
  checkStatus(
    health.json.ok === true,
    'DAA_SMOKE_ENGINE_HEALTH_OK_FALSE',
    '/api/daa/engine-health ok=false body=' + snippet(health.text)
  );

  console.log('[DAA][SMOKE] PASS dashboard+engine-health base=' + root);
}

main().catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error('[DAA][SMOKE] FAIL ' + msg);
  process.exit(1);
});
