"use client";

import { useCallback, useState } from "react";
import { Database, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import {
  DaaSurfacePanel,
  DaaSurfaceActionButton,
  DaaSurfaceFilterChip,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

/* ---------- types ---------- */

type BackfillRange = "1y" | "2y" | "5y";
type BackfillInterval = "1d";

interface BackfillResult {
  totalAssets: number;
  completedAssets: number;
  failedAssets: string[];
  totalRows: number;
  rowsWritten: number;
  rowsReused: number;
  durationMs: number;
}

type RawBackfillResult = {
  total?: unknown;
  completed?: unknown;
  failed?: unknown;
  rowsInserted?: unknown;
  rowsWritten?: unknown;
  rowsCovered?: unknown;
  rowsReused?: unknown;
  totalAssets?: unknown;
  completedAssets?: unknown;
  failedAssets?: unknown;
  totalRows?: unknown;
  durationMs?: unknown;
};

/* ---------- constants ---------- */

const RANGE_OPTIONS: { value: BackfillRange; label: string; tradingDays: number }[] = [
  { value: "1y", label: "1年", tradingDays: 252 },
  { value: "2y", label: "2年", tradingDays: 504 },
  { value: "5y", label: "5年", tradingDays: 1260 },
];

const INTERVAL_OPTIONS: { value: BackfillInterval; label: string; multiplier: number }[] = [
  { value: "1d", label: "日线", multiplier: 1 },
];

const TOTAL_ASSETS = 78;

function estimateRows(range: BackfillRange, interval: BackfillInterval): { days: number; rows: number } {
  const rangeOption = RANGE_OPTIONS.find((r) => r.value === range)!;
  const intervalOption = INTERVAL_OPTIONS.find((i) => i.value === interval)!;
  const rows = TOTAL_ASSETS * rangeOption.tradingDays * intervalOption.multiplier;
  return { days: rangeOption.tradingDays, rows };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeFailedAssets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (isRecord(item) && typeof item.assetKey === "string") return item.assetKey;
      return "";
    })
    .filter(Boolean);
}

function normalizeBackfillResult(payload: unknown, fallbackDurationMs: number): BackfillResult {
  const source = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  const raw = (isRecord(source) ? source : {}) as RawBackfillResult;
  return {
    totalAssets: toFiniteNumber(raw.totalAssets ?? raw.total),
    completedAssets: toFiniteNumber(raw.completedAssets ?? raw.completed),
    failedAssets: normalizeFailedAssets(raw.failedAssets ?? raw.failed),
    totalRows: toFiniteNumber(raw.totalRows ?? raw.rowsCovered ?? raw.rowsInserted),
    rowsWritten: toFiniteNumber(raw.rowsWritten ?? raw.rowsInserted),
    rowsReused: toFiniteNumber(raw.rowsReused),
    durationMs: toFiniteNumber(raw.durationMs, fallbackDurationMs),
  };
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.error === "string") return payload.error;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  return null;
}

/* ---------- component ---------- */

export function SettingsDataInitSection() {
  const [range, setRange] = useState<BackfillRange>("1y");
  const [interval, setInterval] = useState<BackfillInterval>("1d");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const { days, rows } = estimateRows(range, interval);

  const handleStart = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setError("");
    setProgress({ completed: 0, total: TOTAL_ASSETS });

    try {
      const startedAt = performance.now();
      const res = await fetch("/api/daa/store/data-init/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range, interval }),
      });
      const body: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(extractErrorMessage(body) || `请求失败 (${res.status})`);
      }

      const data = normalizeBackfillResult(body, performance.now() - startedAt);
      setResult(data);
      setProgress({ completed: data.completedAssets, total: data.totalAssets });
    } catch (e) {
      setError(e instanceof Error ? e.message : "历史数据初始化失败");
    } finally {
      setRunning(false);
    }
  }, [range, interval]);

  return (
    <section id="settings-data-init" className="scroll-mt-28">
      <DaaSurfacePanel
        title="历史数据初始化"
        subtitle="一键回填资产池的真实 OHLCV 行情，用于 K 线、技术指标和回测引擎。首次使用或切换数据源后建议执行。"
        accent="cyan"
      >
        <div className="space-y-5">
          {/* --- 参数选择 --- */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* 时间范围 */}
            <div>
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--faint)]">
                回填范围
              </div>
              <div className="flex flex-wrap gap-2">
                {RANGE_OPTIONS.map((opt) => (
                  <DaaSurfaceFilterChip
                    key={opt.value}
                    active={range === opt.value}
                    onClick={() => setRange(opt.value)}
                    disabled={running}
                  >
                    {opt.label}
                  </DaaSurfaceFilterChip>
                ))}
              </div>
            </div>

            {/* 数据粒度 */}
            <div>
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--faint)]">
                数据粒度
              </div>
              <div className="flex flex-wrap gap-2">
                {INTERVAL_OPTIONS.map((opt) => (
                  <DaaSurfaceFilterChip
                    key={opt.value}
                    active={interval === opt.value}
                    onClick={() => setInterval(opt.value)}
                    disabled={running}
                  >
                    {opt.label}
                  </DaaSurfaceFilterChip>
                ))}
              </div>
            </div>
          </div>

          {/* --- 预估信息 --- */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-4 py-3">
            <div className="text-sm text-[var(--muted)]">
              预计: <span className="font-semibold text-[var(--text)]">{TOTAL_ASSETS}</span> 资产
              {" \u00d7 "}
              <span className="font-semibold text-[var(--text)]">{days.toLocaleString()}</span> 交易日
              {" \u2248 "}
              <span className="font-semibold text-[var(--primary)]">{rows.toLocaleString()}</span> 条记录
            </div>
          </div>

          {/* --- 启动按钮 --- */}
          <div className="flex items-center gap-3">
            <DaaSurfaceActionButton
              tone="primary"
              onClick={() => void handleStart()}
              disabled={running}
              className="h-10 rounded-full px-5 text-sm"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  初始化中…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  开始初始化
                </>
              )}
            </DaaSurfaceActionButton>

            {result && !error ? (
              <DaaSurfaceStatusPill tone="green">
                初始化完成
              </DaaSurfaceStatusPill>
            ) : null}
          </div>

          {/* --- 进度条 --- */}
          {running || result ? (
            <div className="space-y-2">
              {/* 进度条 */}
              <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className={`h-full rounded-full bg-[var(--primary)] transition-all duration-300${running ? " animate-pulse" : ""}`}
                  style={{ width: `${running ? "100" : (result ? 100 : 0)}%`, opacity: running ? 0.6 : 1 }}
                />
              </div>

              {/* 进度文字 */}
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>
                  {running
                    ? `${progress?.completed ?? 0}/${progress?.total ?? TOTAL_ASSETS} 资产完成`
                    : result
                      ? `${result.completedAssets}/${result.totalAssets} 资产完成，覆盖 ${result.totalRows.toLocaleString()} 条，写入 ${result.rowsWritten.toLocaleString()} 条，复用 ${result.rowsReused.toLocaleString()} 条`
                      : ""}
                </span>
                {result && !running ? (
                  <span className="text-[var(--faint)]">
                    耗时 {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* --- 成功状态 --- */}
          {result && !error && result.failedAssets.length === 0 ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <div className="text-sm text-[var(--primary)]">
                全部 {result.completedAssets} 个资产的历史数据已完成覆盖，共 {result.totalRows.toLocaleString()} 条记录，本次写入/更新 {result.rowsWritten.toLocaleString()} 条，复用缓存 {result.rowsReused.toLocaleString()} 条。
              </div>
            </div>
          ) : null}

          {/* --- 部分失败 --- */}
          {result && !error && result.failedAssets.length > 0 ? (
            <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="text-sm text-amber-300">
                  {result.completedAssets}/{result.totalAssets} 资产成功，{result.failedAssets.length} 个资产失败:
                </div>
              </div>
              <div className="ml-7 flex flex-wrap gap-1.5">
                {result.failedAssets.map((asset) => (
                  <DaaSurfaceStatusPill key={asset} tone="amber">{asset}</DaaSurfaceStatusPill>
                ))}
              </div>
            </div>
          ) : null}

          {/* --- 错误状态 --- */}
          {error ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
              <div className="text-sm text-red-300">{error}</div>
            </div>
          ) : null}
        </div>
      </DaaSurfacePanel>
    </section>
  );
}
