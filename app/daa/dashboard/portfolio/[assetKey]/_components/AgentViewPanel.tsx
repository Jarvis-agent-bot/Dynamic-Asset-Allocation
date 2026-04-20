"use client";

/**
 * Agent 视角面板。
 * 展示 Cognitive Agent 针对本资产当前的研究 thesis + 最新证据。
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Loader2, AlertCircle, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type ConvictionLevel = "high" | "medium" | "low" | "uncertain";
type EvidenceType = "supporting" | "contradicting" | "neutral";

interface Evidence {
  id: string;
  threadId: string;
  evidenceType: EvidenceType;
  source: string;
  content: string;
  createdAt: string;
}

interface Thesis {
  id: string;
  title: string;
  thesisText: string;
  conviction: ConvictionLevel;
  assetKeys: string[];
  tags: string[];
  updatedAt: string;
  latestEvidence?: Evidence[];
}

interface Response {
  theses: Thesis[];
  assetKey: string;
}

function convictionBadge(conviction: ConvictionLevel): { label: string; color: string } {
  switch (conviction) {
    case "high":     return { label: "高信心", color: "bg-emerald-500/15 text-emerald-300" };
    case "medium":   return { label: "中信心", color: "bg-indigo-500/15 text-indigo-300" };
    case "low":      return { label: "低信心", color: "bg-amber-500/15 text-amber-300" };
    default:         return { label: "待确认", color: "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]" };
  }
}

function evidenceTone(type: EvidenceType): string {
  if (type === "supporting") return "text-emerald-300";
  if (type === "contradicting") return "text-red-300";
  return "text-[var(--muted)]";
}

function daysSince(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms) || ms < 0) return "刚刚";
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 1) return "刚刚";
  if (hrs < 24) return `${hrs}h 前调查`;
  const days = Math.floor(hrs / 24);
  return `${days}d 前调查`;
}

export function AgentViewPanel({ assetKey }: { assetKey: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daa/agent/theses?assetKey=${encodeURIComponent(assetKey)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [assetKey]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-indigo-300" />
          <h3 className="text-sm font-medium text-[var(--text)]">Agent 观点</h3>
        </div>
        <Link
          href="/daa/dashboard/today"
          className="flex items-center gap-1 text-[10px] text-[var(--faint)] hover:text-indigo-300"
        >
          日报 <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载 Agent 论点…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {!loading && !error && data && data.theses.length === 0 && (
        <div className="rounded-md border border-dashed border-[rgba(255,255,255,0.08)] px-3 py-4 text-center text-[11px] text-[var(--faint)]">
          Agent 尚未针对此资产建立论点
        </div>
      )}

      {!loading && data && data.theses.length > 0 && (
        <ul className="space-y-3">
          {data.theses.map((t) => {
            const badge = convictionBadge(t.conviction);
            return (
              <li key={t.id} className="space-y-1.5">
                <Link
                  href={`/daa/dashboard/today/thesis/${t.id}`}
                  className="group block"
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", badge.color)}>
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[var(--text)] group-hover:text-indigo-300 transition-colors line-clamp-2">
                        {t.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--faint)]">
                        {daysSince(t.updatedAt)}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 最新证据片段 */}
                {t.latestEvidence && t.latestEvidence.length > 0 && (
                  <ul className="ml-2 border-l border-[rgba(255,255,255,0.06)] pl-3 space-y-1">
                    {t.latestEvidence.slice(0, 2).map((e) => (
                      <li key={e.id} className="text-[11px] text-[var(--muted)] line-clamp-2">
                        <span className={cn("font-medium mr-1", evidenceTone(e.evidenceType))}>
                          {e.evidenceType === "supporting" ? "↑" : e.evidenceType === "contradicting" ? "↓" : "·"}
                        </span>
                        {e.content}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
