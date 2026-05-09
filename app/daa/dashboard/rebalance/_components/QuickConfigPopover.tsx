"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import {
  DaaSurfaceActionButton,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { getSystemConfig, patchSystemConfig } from "@/src/daa/modules/store/dashboardStoreApiClient";

export function QuickConfigPopover(props: {
  driftThresholdPct?: number;
}) {
  const [open, setOpen] = useState(false);
  const [driftThreshold, setDriftThreshold] = useState(String((props.driftThresholdPct ?? 0.05) * 100));
  const [maxPosition, setMaxPosition] = useState("20");
  const [stopLoss, setStopLoss] = useState("10");
  const [takeProfit, setTakeProfit] = useState("30");
  const [saving, setSaving] = useState(false);

  // Sync with props
  useEffect(() => {
    setDriftThreshold(String((props.driftThresholdPct ?? 0.05) * 100));
  }, [props.driftThresholdPct]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getSystemConfig().then((current) => {
      if (cancelled) return;
      setDriftThreshold(String((current.config.rebalanceStrategy.drift.thresholdPct ?? 0.05) * 100));
      setMaxPosition(String((current.config.strategy.constraints.maxPositionPct ?? 0.2) * 100));
      setStopLoss(String((current.config.strategy.risk.perAssetStopLossPct ?? 0.1) * 100));
      setTakeProfit(String((current.config.strategy.risk.perAssetTakeProfitPct ?? 0.3) * 100));
    }).catch(() => {
      // 打开调参面板时读取失败不阻断，保存时仍会重新读取版本。
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = useCallback(async () => {
    const vals = [Number(driftThreshold), Number(maxPosition), Number(stopLoss), Number(takeProfit)];
    if (vals.some((v) => !Number.isFinite(v) || v <= 0)) {
      toast.error("所有参数必须为正数");
      return;
    }
    setSaving(true);
    try {
      const current = await getSystemConfig();
      await patchSystemConfig({
        baseVersion: current.version,
        patches: [
          { path: "rebalanceStrategy.drift.thresholdPct", value: Number(driftThreshold) / 100 },
          { path: "strategy.constraints.maxPositionPct", value: Number(maxPosition) / 100 },
          { path: "strategy.risk.perAssetStopLossPct", value: Number(stopLoss) / 100 },
          { path: "strategy.risk.perAssetTakeProfitPct", value: Number(takeProfit) / 100 },
        ],
      });
      toast.success("策略参数已更新");
      setOpen(false);
    } catch (err) {
      toast.error("保存失败：" + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setSaving(false);
    }
  }, [driftThreshold, maxPosition, stopLoss, takeProfit]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(8,12,20,0.6)] text-[var(--muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
        title="快速调参"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Popover */}
          <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.98)] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className="text-sm font-semibold text-[var(--text)]">快速调参</div>
              <div className="mt-0.5 text-xs text-[var(--faint)]">调整关键策略参数，无需前往设置页</div>
            </div>
            <div className="space-y-3 px-4 py-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                  漂移阈值 (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="0.5"
                  value={driftThreshold}
                  onChange={(e) => setDriftThreshold(e.target.value)}
                  className={daaSurfaceFieldClassName + " h-9 w-full"}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                  最大单仓 (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={maxPosition}
                  onChange={(e) => setMaxPosition(e.target.value)}
                  className={daaSurfaceFieldClassName + " h-9 w-full"}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                    止损 (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className={daaSurfaceFieldClassName + " h-9 w-full"}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                    止盈 (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    className={daaSurfaceFieldClassName + " h-9 w-full"}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
              <DaaSurfaceActionButton tone="slate" onClick={() => setOpen(false)}>
                取消
              </DaaSurfaceActionButton>
              <DaaSurfaceActionButton tone="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "保存中…" : "保存"}
              </DaaSurfaceActionButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
