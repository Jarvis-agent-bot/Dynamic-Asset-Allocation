"use client";

/**
 * Agent 视角面板。
 * 展示 Cognitive Agent 针对本资产当前的研究 thesis + 最新证据。
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, Loader2, AlertCircle, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { deriveEvidenceQuality, normalizeAgentEvidenceContent, type EvidenceQualityLevel } from "@/src/daa/agent/evidenceText";

type ConvictionLevel = "high" | "medium" | "low" | "uncertain";
type EvidenceType = "supporting" | "contradicting" | "neutral";

interface Evidence {
  id: string;
  threadId: string;
  evidenceType: EvidenceType;
  source: string;
  content: string;
  dataSnapshot?: Record<string, unknown> | null;
  confidence?: number | null;
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
    default:         return { label: "证据不足", color: "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]" };
  }
}

function evidenceTone(type: EvidenceType): string {
  if (type === "supporting") return "text-emerald-300";
  if (type === "contradicting") return "text-red-300";
  return "text-[var(--muted)]";
}

function evidenceQualityClass(level: EvidenceQualityLevel): string {
  if (level === "high") return "bg-emerald-500/10 text-emerald-300";
  if (level === "medium") return "bg-sky-500/10 text-sky-300";
  return "bg-amber-500/10 text-amber-300";
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
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[#a3ff12]" />
          <h3 className="text-sm font-semibold text-[#f3f6f8]">研究观点</h3>
        </div>
        <Link
          href="/daa/dashboard/today"
          className="flex items-center gap-1 text-[10px] text-[#59636f] hover:text-[#a3ff12]"
        >
          日报 <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-[#8a939f]">
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
        <div className="rounded-[8px] border border-dashed border-[#252d36] bg-[#050607] px-3 py-4 text-center text-[11px] text-[#8a939f]">
          Agent 尚未针对此资产建立论点
        </div>
      )}

      {!loading && data && data.theses.length > 0 && (
        <ul className="space-y-3">
          {data.theses.map((t) => {
            const badge = convictionBadge(t.conviction);
            const latestEvidence = (t.latestEvidence ?? []).slice(0, 2);
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
                      <div className="line-clamp-2 text-xs font-medium text-[#d6dde5] transition-colors group-hover:text-[#a3ff12]">
                        {t.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#59636f]">
                        {daysSince(t.updatedAt)}
                      </div>
                    </div>
                  </div>
                </Link>

                {/* 最新证据片段 */}
                {latestEvidence.length > 0 ? (
                  <ul className="ml-2 space-y-1 border-l border-[#151b22] pl-3">
                    {latestEvidence.map((e) => {
                      const quality = deriveEvidenceQuality(e);
                      return (
                        <li key={e.id} className="line-clamp-2 text-[11px] text-[#8a939f]">
                          <span className={cn("font-medium mr-1", evidenceTone(e.evidenceType))}>
                            {e.evidenceType === "supporting" ? "↑" : e.evidenceType === "contradicting" ? "↓" : "·"}
                          </span>
                          <span
                            title={quality.reason}
                            className={cn("mr-1 rounded px-1 py-0.5 text-[10px] font-medium", evidenceQualityClass(quality.level))}
                          >
                            {quality.label.replace("证据质量 ", "")}
                          </span>
                          {normalizeAgentEvidenceContent(e.content)}
                        </li>
                      );
                    })}
                  </ul>
                ) : t.conviction === "uncertain" ? (
                  <div className="ml-2 border-l border-[#151b22] pl-3 text-[11px] text-[#59636f]">
                    暂无可用证据，等待下一轮调查确认。
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
