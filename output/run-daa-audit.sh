#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation"
OUT_DIR="$ROOT_DIR/output/playwright"
SRC_DIR="$ROOT_DIR/output/playwright-src"
BASE_URL="${DAA_AUDIT_BASE_URL:-http://127.0.0.1:3003}"

SAFE_BASELINE_LOG="$SRC_DIR/baseline-e2e.log"
SAFE_BASELINE_JSON="$SRC_DIR/baseline-summary.json"
SAFE_DEEP_E2E_LOG="$SRC_DIR/deep-e2e.log"
BASELINE_LOG="$OUT_DIR/baseline-e2e.log"
DEEP_E2E_LOG="$OUT_DIR/deep-e2e.log"
ROUTE_LOG="$OUT_DIR/route-tests.log"
SMOKE_LOG="$OUT_DIR/audit-smoke.log"
LIVE_LOG="$OUT_DIR/audit-live-regression.log"
BASELINE_JSON="$OUT_DIR/baseline-summary.json"
DEEP_E2E_JSON="$OUT_DIR/deep-e2e-summary.json"
ROUTE_JSON="$OUT_DIR/route-summary.json"
SERVER_SMOKE_LOG="$OUT_DIR/audit-server-smoke.log"
SERVER_LIVE_LOG="$OUT_DIR/audit-server-live.log"

SERVER_PID=""

mkdir -p "$OUT_DIR" "$SRC_DIR"

rm -f \
  "$SAFE_BASELINE_LOG" "$SAFE_BASELINE_JSON" "$SAFE_DEEP_E2E_LOG" \
  "$OUT_DIR"/*.png "$OUT_DIR"/*.json "$OUT_DIR"/*.html \
  "$OUT_DIR"/*.log \
  "$OUT_DIR/daa-audit-report.md" \
  "$OUT_DIR/daa-audit-smoke.cjs" "$OUT_DIR/daa-audit-live-regression.cjs" "$OUT_DIR/write-daa-audit-report.cjs"

cd "$ROOT_DIR"

stop_server() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}

start_server() {
  local server_log="$1"
  : > "$server_log"
  DAA_PG_MEM=1 pnpm exec next dev --port 3003 > "$server_log" 2>&1 &
  SERVER_PID=$!

  for _ in $(seq 1 120); do
    if curl -fsSL "$BASE_URL/daa/login" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "audit server did not become ready: $BASE_URL/daa/login" | tee -a "$server_log"
  return 1
}

cleanup() {
  stop_server
}
trap cleanup EXIT

BASELINE_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
pnpm test:e2e 2>&1 | tee "$SAFE_BASELINE_LOG"
BASELINE_EXIT=${PIPESTATUS[0]}
set -e
BASELINE_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cp "$SAFE_BASELINE_LOG" "$BASELINE_LOG"

export DAA_BASELINE_EXIT="$BASELINE_EXIT"
export DAA_BASELINE_START="$BASELINE_START"
export DAA_BASELINE_END="$BASELINE_END"
python <<'PY'
import json
import os
from pathlib import Path

log_path = Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright/baseline-e2e.log')
text = log_path.read_text(encoding='utf-8', errors='ignore') if log_path.exists() else ''
summary = {
    'command': 'pnpm test:e2e',
    'status': 'passed' if int(os.environ['DAA_BASELINE_EXIT']) == 0 else 'failed',
    'exitCode': int(os.environ['DAA_BASELINE_EXIT']),
    'startedAt': os.environ['DAA_BASELINE_START'],
    'endedAt': os.environ['DAA_BASELINE_END'],
    'logPath': str(log_path),
    'includedSpecs': [
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/public-pages.e2e.ts',
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/daa-deep-flows.e2e.ts',
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/strategy-lab-cross-market.e2e.ts',
    ],
    'knownFailurePath': '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/strategy-lab-cross-market.e2e.ts:947',
    'knownFailureRetained': 'tests/e2e/strategy-lab-cross-market.e2e.ts:947' in text,
}
if summary['status'] == 'failed':
    if summary['knownFailureRetained']:
        summary['notes'] = '基线失败仍落在既有策略实验室跨币种用例，按计划记录为基线缺陷。'
    else:
        summary['notes'] = '基线失败，但失败点已偏离既有已知问题，需要人工复核日志。'
else:
    summary['notes'] = '基线回归已全部通过，且已包含新增 public/deep E2E 套件。'
Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright-src/baseline-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

DEEP_E2E_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
pnpm exec playwright test tests/e2e/public-pages.e2e.ts tests/e2e/daa-deep-flows.e2e.ts 2>&1 | tee "$SAFE_DEEP_E2E_LOG"
DEEP_E2E_EXIT=${PIPESTATUS[0]}
set -e
DEEP_E2E_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

export DAA_DEEP_E2E_EXIT="$DEEP_E2E_EXIT"
export DAA_DEEP_E2E_START="$DEEP_E2E_START"
export DAA_DEEP_E2E_END="$DEEP_E2E_END"
python <<'PY'
import json
import os
from pathlib import Path

log_path = Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright/deep-e2e.log')
summary = {
    'command': 'pnpm exec playwright test tests/e2e/public-pages.e2e.ts tests/e2e/daa-deep-flows.e2e.ts',
    'status': 'passed' if int(os.environ['DAA_DEEP_E2E_EXIT']) == 0 else 'failed',
    'exitCode': int(os.environ['DAA_DEEP_E2E_EXIT']),
    'startedAt': os.environ['DAA_DEEP_E2E_START'],
    'endedAt': os.environ['DAA_DEEP_E2E_END'],
    'logPath': str(log_path),
    'includedSpecs': [
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/public-pages.e2e.ts',
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/tests/e2e/daa-deep-flows.e2e.ts',
    ],
    'notes': '显式回归新增公共页面与工作台/策略实验室深测 Playwright 套件。',
}
Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright/deep-e2e-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

cp "$SAFE_BASELINE_LOG" "$BASELINE_LOG"
cp "$SAFE_BASELINE_JSON" "$BASELINE_JSON"
cp "$SAFE_DEEP_E2E_LOG" "$DEEP_E2E_LOG"

ROUTE_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
pnpm exec vitest run src/daa/__tests__/authBootstrapRouteV1.test.ts src/daa/__tests__/cronRemainingRoutesV1.test.ts 2>&1 | tee "$ROUTE_LOG"
ROUTE_EXIT=${PIPESTATUS[0]}
set -e
ROUTE_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

export DAA_ROUTE_EXIT="$ROUTE_EXIT"
export DAA_ROUTE_START="$ROUTE_START"
export DAA_ROUTE_END="$ROUTE_END"
python <<'PY'
import json
import os
from pathlib import Path

log_path = Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright/route-tests.log')
summary = {
    'command': 'pnpm exec vitest run src/daa/__tests__/authBootstrapRouteV1.test.ts src/daa/__tests__/cronRemainingRoutesV1.test.ts',
    'status': 'passed' if int(os.environ['DAA_ROUTE_EXIT']) == 0 else 'failed',
    'exitCode': int(os.environ['DAA_ROUTE_EXIT']),
    'startedAt': os.environ['DAA_ROUTE_START'],
    'endedAt': os.environ['DAA_ROUTE_END'],
    'logPath': str(log_path),
    'includedTests': [
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/src/daa/__tests__/authBootstrapRouteV1.test.ts',
        '/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/src/daa/__tests__/cronRemainingRoutesV1.test.ts',
    ],
    'notes': '覆盖 bootstrap 管理接口，以及 drift-check / hf-ingest / market-indicators-refresh 三类 cron 路由。',
}
Path('/Users/caikaisheng/Documents/GitHub/Dynamic-Asset-Allocation/output/playwright/route-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

cp "$SRC_DIR/daa-audit-smoke.cjs" "$OUT_DIR/daa-audit-smoke.cjs"
cp "$SRC_DIR/daa-audit-live-regression.cjs" "$OUT_DIR/daa-audit-live-regression.cjs"
cp "$SRC_DIR/write-daa-audit-report.cjs" "$OUT_DIR/write-daa-audit-report.cjs"
chmod +x "$OUT_DIR/daa-audit-smoke.cjs" "$OUT_DIR/daa-audit-live-regression.cjs" "$OUT_DIR/write-daa-audit-report.cjs"

start_server "$SERVER_SMOKE_LOG"
set +e
DAA_AUDIT_BASE_URL="$BASE_URL" node "$OUT_DIR/daa-audit-smoke.cjs" 2>&1 | tee "$SMOKE_LOG"
SMOKE_EXIT=${PIPESTATUS[0]}
set -e
stop_server

start_server "$SERVER_LIVE_LOG"
set +e
DAA_AUDIT_BASE_URL="$BASE_URL" node "$OUT_DIR/daa-audit-live-regression.cjs" 2>&1 | tee "$LIVE_LOG"
LIVE_EXIT=${PIPESTATUS[0]}
set -e
stop_server

node "$OUT_DIR/write-daa-audit-report.cjs"

echo "DAA audit finished. Report: $OUT_DIR/daa-audit-report.md"
echo "Baseline exit=$BASELINE_EXIT, deep-e2e exit=$DEEP_E2E_EXIT, route exit=$ROUTE_EXIT, smoke exit=$SMOKE_EXIT, live exit=$LIVE_EXIT"
