"use client";

import { useCallback, useState } from "react";
import { Database, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import {
  DaaSurfacePanel,
  DaaSurfaceActionButton,
  DaaSurfaceFilterChip,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";

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
  const rangeOption = RANGE_OPTIONS.find((option) => option.value === range)!;
  const intervalOption = INTERVAL_OPTIONS.find((option) => option.value === interval)!;
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

function BackfillEstimateCell({
  label,
  value,
  tone = "neutral",
  index,
}: {
  label: string;
  value: string;
  tone?: "primary" | "neutral";
  index: number;
}) {
  const borderClass = index < 2 ? "border-b border-[var(--border)] sm:border-b-0 sm:border-r" : "";
  const valueClass = tone === "primary" ? "text-[var(--primary)]" : "text-[var(--text)]";

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{label}</div>
      <div className={`mt-1 font-[var(--font-mono)] text-[20px] leading-none ${valueClass}`}>{value}</div>
    </div>
  );
}

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
      const response = await fetch("/api/daa/store/data-init/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range, interval }),
      });
      const responseBody: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(extractErrorMessage(responseBody) || `请求失败 (${response.status})`);
      }

      const backfillResult = normalizeBackfillResult(responseBody, performance.now() - startedAt);
      setResult(backfillResult);
      setProgress({ completed: backfillResult.completedAssets, total: backfillResult.totalAssets });
    } catch (error) {
      setError(error instanceof Error ? error.message : "历史行情回填失败");
    } finally {
      setRunning(false);
    }
  }, [range, interval]);

  return (
    <section id="settings-data-init" className="scroll-mt-28">
      <DaaSurfacePanel
        title="历史行情回填"
        subtitle="补齐 OHLCV 行情，供 K 线、指标与回测使用。"
        accent="primary"
      >
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">
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

            <div>
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-normal text-[var(--faint)]">
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

          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] sm:grid-cols-3">
            <BackfillEstimateCell label="资产数" value={TOTAL_ASSETS.toLocaleString()} index={0} />
            <BackfillEstimateCell label="交易日" value={days.toLocaleString()} index={1} />
            <BackfillEstimateCell label="预计记录" value={rows.toLocaleString()} tone="primary" index={2} />
          </div>

          <div className="flex items-center gap-3">
            <DaaSurfaceActionButton
              tone="primary"
              onClick={() => void handleStart()}
              disabled={running}
              className="h-9 rounded-[var(--radius-sm)] px-4 text-sm"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  回填中…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  开始回填
                </>
              )}
            </DaaSurfaceActionButton>

            {result && !error ? (
              <DaaSurfaceStatusPill tone="success">
                回填完成
              </DaaSurfaceStatusPill>
            ) : null}
          </div>

          {running || result ? (
            <div className="space-y-2">
              <progress
                aria-label="历史行情回填进度"
                className={`block h-2 w-full appearance-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] accent-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)] [&::-webkit-progress-bar]:bg-[var(--elevated)] [&::-webkit-progress-value]:bg-[var(--primary)]${running ? " animate-pulse opacity-60" : ""}`}
                max={100}
                value={running ? undefined : result ? 100 : 0}
              />

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

          {result && !error && result.failedAssets.length === 0 ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--primary-border)] bg-[var(--primary-bg)] px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <div className="text-sm text-[var(--primary)]">
                全部 {result.completedAssets} 个资产的历史数据已完成覆盖，共 {result.totalRows.toLocaleString()} 条记录，本次写入/更新 {result.rowsWritten.toLocaleString()} 条，复用缓存 {result.rowsReused.toLocaleString()} 条。
              </div>
            </div>
          ) : null}

          {result && !error && result.failedAssets.length > 0 ? (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--amber-border)] bg-[var(--amber-bg)] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--amber)]" />
                <div className="text-sm text-[var(--amber)]">
                  {result.completedAssets}/{result.totalAssets} 资产成功，{result.failedAssets.length} 个资产失败:
                </div>
              </div>
              <div className="ml-7 flex flex-wrap gap-1.5">
                {result.failedAssets.map((asset) => (
                  <DaaSurfaceStatusPill key={asset} tone="warning">{asset}</DaaSurfaceStatusPill>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
              <div className="text-sm text-[var(--danger)]">{error}</div>
            </div>
          ) : null}
        </div>
      </DaaSurfacePanel>
    </section>
  );
}
