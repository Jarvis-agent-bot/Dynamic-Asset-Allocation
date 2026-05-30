"use client";

import { useEffect } from "react";
import { Loader2, RefreshCw, RotateCcw, X } from "lucide-react";

import { DaaSurfaceActionButton } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { strategyLabel, type UseStrategyLabResult } from "./useStrategyLab";

interface StrategyLabHistoryDrawerProps {
  state: UseStrategyLabResult;
  open: boolean;
  onClose: () => void;
}

export function StrategyLabHistoryDrawer({ state, open, onClose }: StrategyLabHistoryDrawerProps) {
  const { history, historyLoading, loadHistory, reuseHistoryParams } = state;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="回测历史"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(440px,100vw)] flex-col overflow-hidden border-l border-[var(--border)] bg-[linear-gradient(180deg,var(--elevated),var(--surface))] shadow-[0_30px_70px_rgba(0,0,0,0.55)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)]">回测历史</div>
            <div className="text-[11px] text-[var(--faint)]">最近 10 次运行 · 点击复用参数</div>
          </div>
          <div className="flex items-center gap-1">
            <DaaSurfaceActionButton
              tone="slate"
              className="h-8 px-2 text-xs"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              title="刷新"
            >
              {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </DaaSurfaceActionButton>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {historyLoading && history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : history.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-[var(--muted)]">
              <div className="font-medium text-[var(--text)]">还没有回测记录</div>
              <div className="mt-1 text-xs leading-5 text-[var(--faint)]">运行一次回测后，结果会自动出现在这里。</div>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => {
                const totalReturn = item.metrics?.totalReturn ?? 0;
                const sharpe = item.metrics?.sharpe ?? 0;
                const drawdown = item.metrics?.maxDrawdown ?? 0;
                const strategiesLabel = (item.params?.strategies ?? []).map((s) => strategyLabel(s)).join(" · ") || "—";
                return (
                  <div
                    key={item.runId}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-[var(--muted)]">{formatDateTime(item.createdAt)}</div>
                      <DaaSurfaceActionButton
                        tone="slate"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          reuseHistoryParams(item);
                          onClose();
                        }}
                        title="把这次参数填回左侧表单"
                      >
                        <RotateCcw className="h-3 w-3" />
                        复用参数
                      </DaaSurfaceActionButton>
                    </div>
                    <div className="mt-1 truncate text-[11px] font-[var(--font-mono)] text-[var(--faint)]">
                      {item.startDate} ~ {item.endDate} · {strategiesLabel}
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px] font-[var(--font-mono)]">
                      <div>
                        <div className="text-[var(--faint)]">总收益</div>
                        <div style={{ color: totalReturn >= 0 ? "var(--success)" : "var(--danger)" }}>
                          {totalReturn >= 0 ? "+" : ""}{(totalReturn * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--faint)]">夏普</div>
                        <div className="text-[var(--text)]">{sharpe.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--faint)]">回撤</div>
                        <div className="text-[var(--muted)]">{(drawdown * 100).toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
