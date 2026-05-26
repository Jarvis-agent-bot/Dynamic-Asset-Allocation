"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type AutoEntryRow = {
  assetKey: string;
  autoEntryEnabled: boolean;
  entryTargetWeightPct: number | null;
  entryRules: {
    minTechnicalScore?: number;
    minValuationScore?: number;
    minFusionScore?: number;
    requireStrongMomentum?: boolean;
  } | null;
  entryCooldownDays: number;
  lastEntryTriggeredAt: string | null;
};

const DEFAULT_RULES = { minTechnicalScore: 65, minValuationScore: 60, minFusionScore: 62, requireStrongMomentum: false };

function isCooldownReady(lastEntryTriggeredAt: string | null, cooldownDays: number): boolean {
  if (!lastEntryTriggeredAt) return true;
  const lastMs = Date.parse(lastEntryTriggeredAt);
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs >= Math.max(1, cooldownDays) * 24 * 60 * 60 * 1000;
}

export function WatchlistAutoEntryPanel(props: {
  assetKey: string;
  assetSnapshot: {
    fxMissing: boolean;
    lastPrice: number;
    holdingPrice: number;
  };
}) {
  const { assetKey, assetSnapshot } = props;
  const [row, setRow] = useState<AutoEntryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // 表单字段（与 row 同步）
  const [enabled, setEnabled] = useState(false);
  const [targetWeight, setTargetWeight] = useState<string>("");
  const [cooldownDays, setCooldownDays] = useState<string>("14");
  const [minTech, setMinTech] = useState<string>(String(DEFAULT_RULES.minTechnicalScore));
  const [minVal, setMinVal] = useState<string>(String(DEFAULT_RULES.minValuationScore));
  const [minFusion, setMinFusion] = useState<string>(String(DEFAULT_RULES.minFusionScore));
  const [requireStrong, setRequireStrong] = useState(false);

  const loadRow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daa/workbench/assets/${encodeURIComponent(assetKey)}/auto-entry`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r: AutoEntryRow | null = json?.data?.row ?? null;
      setRow(r);
      if (r) {
        setEnabled(r.autoEntryEnabled);
        setTargetWeight(r.entryTargetWeightPct != null ? String(r.entryTargetWeightPct) : "");
        setCooldownDays(String(r.entryCooldownDays));
        setMinTech(String(r.entryRules?.minTechnicalScore ?? DEFAULT_RULES.minTechnicalScore));
        setMinVal(String(r.entryRules?.minValuationScore ?? DEFAULT_RULES.minValuationScore));
        setMinFusion(String(r.entryRules?.minFusionScore ?? DEFAULT_RULES.minFusionScore));
        setRequireStrong(Boolean(r.entryRules?.requireStrongMomentum));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [assetKey]);

  useEffect(() => {
    void loadRow();
  }, [loadRow]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        autoEntryEnabled: enabled,
        entryTargetWeightPct: targetWeight.trim() === "" ? null : Number(targetWeight),
        entryCooldownDays: Number(cooldownDays) || 14,
        entryRules: {
          minTechnicalScore: Number(minTech) || DEFAULT_RULES.minTechnicalScore,
          minValuationScore: Number(minVal) || DEFAULT_RULES.minValuationScore,
          minFusionScore: Number(minFusion) || DEFAULT_RULES.minFusionScore,
          requireStrongMomentum: requireStrong,
        },
      };
      const res = await fetch(`/api/daa/workbench/assets/${encodeURIComponent(assetKey)}/auto-entry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setMessage("规则已保存");
      await loadRow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [assetKey, enabled, targetWeight, cooldownDays, minTech, minVal, minFusion, requireStrong, loadRow]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载入场候选规则...
      </div>
    );
  }

  if (!row) {
    return (
      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4 text-sm text-[var(--muted)]">
        该资产不在观察列表中，无法配置入场候选规则。
      </div>
    );
  }

  const lastTriggeredLabel = row.lastEntryTriggeredAt
    ? new Date(row.lastEntryTriggeredAt).toLocaleString("zh-CN", { hour12: false })
    : "尚未触发";
  const explicitTargetWeightPct = row.entryTargetWeightPct;
  const effectiveTargetWeightPct = explicitTargetWeightPct != null && explicitTargetWeightPct > 0
    ? explicitTargetWeightPct
    : null;
  const effectiveTargetSource = explicitTargetWeightPct != null && explicitTargetWeightPct > 0
    ? "单资产规则"
    : "未设置";
  const livePrice = assetSnapshot.lastPrice > 0 ? assetSnapshot.lastPrice : assetSnapshot.holdingPrice;
  const firstBlocker = !row.autoEntryEnabled
    ? "未纳入本标的入场候选"
    : !(effectiveTargetWeightPct != null && effectiveTargetWeightPct > 0)
      ? "未设置有效目标权重"
      : !(livePrice > 0) || assetSnapshot.fxMissing
        ? "缺少价格或汇率"
        : !isCooldownReady(row.lastEntryTriggeredAt, row.entryCooldownDays)
          ? `冷静期未过（${row.entryCooldownDays}天）`
          : "已就绪，等待技术 + 估值信号达标";

  return (
    <div className="space-y-3 rounded-[16px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
        <div className="text-sm font-semibold text-[var(--text)]">入场候选规则</div>
      </div>
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        技术 + 估值信号同时达标时，下一次策略 cron 会为此标的生成 BUY 提案。需在设置里的入场候选过滤器开启全局开关。
      </p>

      <div className="grid gap-2 rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--muted)]">
        <div className="flex items-center justify-between gap-3">
          <span>当前状态</span>
          <span className={cn("font-medium", row.autoEntryEnabled ? "text-emerald-300" : "text-amber-300")}>
            {row.autoEntryEnabled ? "已开启" : "未开启"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>有效目标</span>
          <span className="font-medium text-[var(--text)]">
            {effectiveTargetWeightPct != null ? `${effectiveTargetWeightPct.toFixed(1)}% · ${effectiveTargetSource}` : "未设置"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span>首要阻断</span>
          <span className="max-w-[220px] text-right text-[var(--text)]">{firstBlocker}</span>
        </div>
      </div>

      {/* 启用开关 */}
      <label className="flex items-center gap-2 text-sm text-[var(--text)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--border)] bg-transparent"
        />
        纳入本标的入场候选
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-[var(--muted)]">
          <div>目标权重 (%)</div>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            placeholder="例如 5"
            className="w-full rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5 text-sm font-[var(--font-mono)] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--muted)]">
          <div>冷静期 (天)</div>
          <input
            type="number"
            min="1"
            max="90"
            step="1"
            value={cooldownDays}
            onChange={(e) => setCooldownDays(e.target.value)}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5 text-sm font-[var(--font-mono)] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--muted)]">
          <div>技术评分阈值</div>
          <input
            type="number"
            min="0"
            max="100"
            value={minTech}
            onChange={(e) => setMinTech(e.target.value)}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5 text-sm font-[var(--font-mono)] text-[var(--text)]"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--muted)]">
          <div>估值评分阈值</div>
          <input
            type="number"
            min="0"
            max="100"
            value={minVal}
            onChange={(e) => setMinVal(e.target.value)}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5 text-sm font-[var(--font-mono)] text-[var(--text)]"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--muted)]">
          <div>融合评分阈值</div>
          <input
            type="number"
            min="0"
            max="100"
            value={minFusion}
            onChange={(e) => setMinFusion(e.target.value)}
            className="w-full rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5 text-sm font-[var(--font-mono)] text-[var(--text)]"
          />
        </label>
        <label className="flex items-end gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={requireStrong}
            onChange={(e) => setRequireStrong(e.target.checked)}
            className="mb-1.5 h-4 w-4 rounded border-[var(--border)] bg-transparent"
          />
          要求强动量
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 text-xs text-[var(--muted)]">
        <span>上次触发：{lastTriggeredLabel}</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
            saving
              ? "bg-[rgba(56,189,248,0.08)] text-[var(--muted)]"
              : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
          )}
        >
          {saving ? "保存中..." : "保存规则"}
        </button>
      </div>

      {error ? <div className="text-xs text-red-400">错误：{error}</div> : null}
      {message ? <div className="text-xs text-emerald-400">{message}</div> : null}
    </div>
  );
}
