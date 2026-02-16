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

function checkStatus(ok, message) {
  if (!ok) {
    throw new Error(message);
  }
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
  checkStatus(dashboard.resp.status < 400, '/daa/dashboard status=' + dashboard.resp.status);
  checkStatus(dashboard.text.toLowerCase().includes('daa') || dashboard.text.toLowerCase().includes('dashboard'), '/daa/dashboard returned unexpected html body');

  const health = await getJson(root + '/api/daa/engine-health');
  checkStatus(health.resp.status === 200, '/api/daa/engine-health status=' + health.resp.status + ' body=' + health.text.slice(0, 240));
  checkStatus(health.json && typeof health.json === 'object', '/api/daa/engine-health returned non-json payload');
  checkStatus(typeof health.json.ok === 'boolean', '/api/daa/engine-health missing boolean ok field');
  checkStatus(health.json.ok === true, '/api/daa/engine-health ok=false body=' + health.text.slice(0, 240));

  console.log('[DAA][SMOKE] PASS dashboard+engine-health base=' + root);
}

main().catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error('[DAA][SMOKE] FAIL ' + msg);
  process.exit(1);
});
