"use client";

/**
 * 投资判断面板。
 * 展示当前资产相关的投资判断与最新复核依据。
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, AlertCircle, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  deriveReviewBasisQuality,
  normalizeInvestmentReviewBasisContent,
  type ReviewBasisQualityLevel,
} from "@/src/daa/agent/evidenceText";

type ConvictionLevel = "high" | "medium" | "low" | "uncertain";
type ReviewBasisType = "supporting" | "contradicting" | "neutral";

interface ReviewBasis {
  id: string;
  threadId: string;
  evidenceType: ReviewBasisType;
  source: string;
  content: string;
  dataSnapshot?: Record<string, unknown> | null;
  confidence?: number | null;
  createdAt: string;
}

interface InvestmentJudgment {
  id: string;
  title: string;
  thesisText: string;
  conviction: ConvictionLevel;
  assetKeys: string[];
  tags: string[];
  updatedAt: string;
  latestReviewBasis?: ReviewBasis[];
}

interface ApiInvestmentJudgment extends Omit<InvestmentJudgment, "latestReviewBasis"> {
  latestEvidence?: ReviewBasis[];
}

interface InvestmentJudgmentFeed {
  theses: InvestmentJudgment[];
  assetKey: string;
}

interface ApiInvestmentJudgmentFeed {
  theses: ApiInvestmentJudgment[];
  assetKey: string;
}

function normalizeInvestmentJudgmentFeed(feed: ApiInvestmentJudgmentFeed): InvestmentJudgmentFeed {
  return {
    assetKey: feed.assetKey,
    theses: (feed.theses ?? []).map((judgment) => {
      const { latestEvidence, ...rest } = judgment;
      return {
        ...rest,
        latestReviewBasis: latestEvidence ?? [],
      };
    }),
  };
}

function convictionBadge(conviction: ConvictionLevel): { label: string; color: string } {
  switch (conviction) {
    case "high":     return { label: "高确信", color: "bg-[var(--success-bg)] text-[var(--success)]" };
    case "medium":   return { label: "中等确信", color: "bg-[var(--indigo-bg)] text-[var(--indigo)]" };
    case "low":      return { label: "低确信", color: "bg-[var(--amber-bg)] text-[var(--amber)]" };
    default:         return { label: "待确认", color: "bg-[var(--elevated)] text-[var(--muted)]" };
  }
}

function reviewBasisTone(type: ReviewBasisType): string {
  if (type === "supporting") return "text-[var(--success)]";
  if (type === "contradicting") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

function reviewBasisQualityClass(level: ReviewBasisQualityLevel): string {
  if (level === "high") return "bg-[var(--success-bg)] text-[var(--success)]";
  if (level === "medium") return "bg-[var(--primary-bg)] text-[var(--primary)]";
  return "bg-[var(--amber-bg)] text-[var(--amber)]";
}

function formatLastReviewedAt(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms) || ms < 0) return "刚刚";
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 1) return "刚刚";
  if (hrs < 24) return `${hrs}h 前复核`;
  const days = Math.floor(hrs / 24);
  return `${days}d 前复核`;
}

export function InvestmentJudgmentPanel({ assetKey }: { assetKey: string }) {
  const [investmentJudgmentFeed, setInvestmentJudgmentFeed] = useState<InvestmentJudgmentFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/daa/agent/theses?assetKey=${encodeURIComponent(assetKey)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const jsonPayload = await response.json();
      setInvestmentJudgmentFeed(normalizeInvestmentJudgmentFeed(jsonPayload.data));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [assetKey]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--text)]">投资判断</h3>
        </div>
        <Link
          href="/daa/dashboard/today"
          className="flex items-center gap-1 text-[10px] text-[var(--muted)] hover:text-[var(--primary)]"
        >
          今日 <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-xs text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载投资判断…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--amber)]">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {!loading && !error && investmentJudgmentFeed && investmentJudgmentFeed.theses.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted)]">
          还没有针对此资产形成可复核判断
        </div>
      )}

      {!loading && investmentJudgmentFeed && investmentJudgmentFeed.theses.length > 0 && (
        <ul className="space-y-3">
          {investmentJudgmentFeed.theses.map((judgment) => {
            const badge = convictionBadge(judgment.conviction);
            const latestReviewBasis = (judgment.latestReviewBasis ?? []).slice(0, 2);
            return (
              <li key={judgment.id} className="space-y-1.5">
                <Link
                  href={`/daa/dashboard/today/thesis/${judgment.id}`}
                  className="group block"
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("shrink-0 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium", badge.color)}>
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-xs font-medium text-[var(--text)] transition-colors group-hover:text-[var(--primary)]">
                        {judgment.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--faint)]">
                        {formatLastReviewedAt(judgment.updatedAt)}
                      </div>
                    </div>
                  </div>
                </Link>

                {latestReviewBasis.length > 0 ? (
                  <ul className="ml-2 space-y-1 border-l border-[var(--elevated)] pl-3">
                    {latestReviewBasis.map((reviewBasis) => {
                      const quality = deriveReviewBasisQuality(reviewBasis);
                      return (
                        <li key={reviewBasis.id} className="line-clamp-2 text-[11px] text-[var(--muted)]">
                          <span className={cn("font-medium mr-1", reviewBasisTone(reviewBasis.evidenceType))}>
                            {reviewBasis.evidenceType === "supporting" ? "↑" : reviewBasis.evidenceType === "contradicting" ? "↓" : "·"}
                          </span>
                          <span
                            title={quality.reason}
                            className={cn("mr-1 rounded-[var(--radius-sm)] px-1 py-0.5 text-[10px] font-medium", reviewBasisQualityClass(quality.level))}
                          >
                            {quality.label}
                          </span>
                          {normalizeInvestmentReviewBasisContent(reviewBasis.content)}
                        </li>
                      );
                    })}
                  </ul>
                ) : judgment.conviction === "uncertain" ? (
                  <div className="ml-2 border-l border-[var(--elevated)] pl-3 text-[11px] text-[var(--faint)]">
                    暂无可用复核依据，等待下一轮复核确认。
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
