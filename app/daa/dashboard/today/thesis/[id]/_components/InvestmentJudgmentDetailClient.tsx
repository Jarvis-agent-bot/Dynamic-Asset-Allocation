"use client";

/**
 * 投资判断详情页 — 展示依据链、失效条件和复核历史。
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, Target, Clock, CheckCircle, XCircle, MinusCircle } from "lucide-react";

import {
  deriveReviewBasisQuality,
  normalizeInvestmentReviewBasisContent,
} from "@/src/daa/agent/evidenceText";
import { WorkbenchLoadingState } from "@/app/daa/dashboard/_components/WorkbenchFeedback";

interface ReviewBasisRecord {
  id: string;
  evidenceType: string;
  source: string;
  content: string;
  dataSnapshot?: Record<string, unknown> | null;
  confidence: number;
  createdAt: string;
}

interface InvestmentReviewRecord {
  id: string;
  reviewWindow: string;
  thesisAtTime: string;
  convictionAtTime: string;
  actualOutcome: string | null;
  accuracyScore: number | null;
  lessonsLearned: string | null;
  createdAt: string;
}

interface InvestmentJudgmentThread {
  id: string;
  title: string;
  status: string;
  thesisText: string;
  conviction: string;
  invalidationConditions: string | null;
  reviewAt: string | null;
  assetKeys: string[];
  tags: string[];
  priorityScore: number;
  createdAt: string;
  updatedAt: string;
}

interface InvestmentJudgmentDetail {
  thread: InvestmentJudgmentThread;
  reviewBasisTimeline: ReviewBasisRecord[];
  reviews: InvestmentReviewRecord[];
}

interface ApiInvestmentJudgmentDetail extends Omit<InvestmentJudgmentDetail, "reviewBasisTimeline"> {
  evidence: ReviewBasisRecord[];
}

function normalizeInvestmentJudgmentDetail(detail: ApiInvestmentJudgmentDetail): InvestmentJudgmentDetail {
  const { evidence, ...rest } = detail;
  return {
    ...rest,
    reviewBasisTimeline: evidence ?? [],
  };
}

function formatReviewBasisType(type: string): string {
  if (type === "supporting") return "支持判断";
  if (type === "contradicting") return "削弱判断";
  return "中性依据";
}

function formatReviewBasisSource(source: string): string {
  if (source === "market_data") return "市场数据";
  if (source === "news") return "新闻";
  if (source === "technical") return "技术面";
  if (source === "valuation") return "估值";
  if (source === "agent_reasoning") return "后台复核";
  if (source === "human") return "人工记录";
  if (source === "trade_outcome") return "交易结果";
  return source || "-";
}

export default function InvestmentJudgmentDetailClient({ judgmentId }: { judgmentId: string }) {
  const router = useRouter();
  const [investmentJudgmentDetail, setInvestmentJudgmentDetail] = useState<InvestmentJudgmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/daa/agent/thesis/${encodeURIComponent(judgmentId)}`);
      if (!response.ok) {
        setError(response.status === 404 ? "投资判断不存在" : `加载失败 (${response.status})`);
        return;
      }
      const json = await response.json();
      setInvestmentJudgmentDetail(normalizeInvestmentJudgmentDetail(json.data));
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [judgmentId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <WorkbenchLoadingState title="正在加载投资判断" description="同步复核依据、失效条件与复核历史。" />;
  }

  if (error || !investmentJudgmentDetail) {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <div className="text-sm font-medium text-[var(--text)]">{error || "投资判断不存在"}</div>
        <button type="button" onClick={() => router.push("/daa/dashboard/today")}
          className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
          返回今日
        </button>
      </div>
    );
  }

  const { thread, reviewBasisTimeline, reviews } = investmentJudgmentDetail;
  const convictionColor =
    thread.conviction === "high" ? "text-[var(--success)] bg-[var(--success-bg)]" :
    thread.conviction === "medium" ? "text-[var(--amber)] bg-[var(--amber-bg)]" :
    thread.conviction === "low" ? "text-[var(--danger)] bg-[var(--danger-bg)]" : "text-[var(--faint)] bg-[var(--elevated)]";
  const convictionLabel =
    thread.conviction === "high" ? "高确信" :
    thread.conviction === "medium" ? "中等确信" :
    thread.conviction === "low" ? "低确信" :
    "待确认";

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={() => router.push("/daa/dashboard/today")}
          className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回今日
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text)]">{thread.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--faint)]">
              <span>{thread.assetKeys.join(", ")}</span>
              <span>·</span>
              <span>创建于 {new Date(thread.createdAt).toLocaleDateString("zh-CN")}</span>
              <span>·</span>
              <span>更新于 {new Date(thread.updatedAt).toLocaleDateString("zh-CN")}</span>
            </div>
          </div>
          <span className={`shrink-0 rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium ${convictionColor}`}>
            {convictionLabel}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <Target className="h-3.5 w-3.5" />
            复核依据时间线 ({reviewBasisTimeline.length})
          </h2>
          {reviewBasisTimeline.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--hover)] px-3 py-2 text-xs text-[var(--faint)]">
              暂无复核依据
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)]">
              {reviewBasisTimeline.map((reviewBasis) => {
                const Icon = reviewBasis.evidenceType === "supporting" ? CheckCircle :
                  reviewBasis.evidenceType === "contradicting" ? XCircle : MinusCircle;
                const iconColor = reviewBasis.evidenceType === "supporting" ? "text-[var(--success)]" :
                  reviewBasis.evidenceType === "contradicting" ? "text-[var(--danger)]" : "text-[var(--faint)]";
                const typeBg = reviewBasis.evidenceType === "supporting" ? "bg-[var(--success-bg)] text-[var(--success)]" :
                  reviewBasis.evidenceType === "contradicting" ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--elevated)] text-[var(--faint)]";
                const quality = deriveReviewBasisQuality(reviewBasis);
                const qualityBg = quality.level === "high"
                  ? "bg-[var(--success-bg)] text-[var(--success)]"
                  : quality.level === "medium"
                    ? "bg-[var(--primary-bg)] text-[var(--primary)]"
                    : "bg-[var(--amber-bg)] text-[var(--amber)]";
                return (
                  <div key={reviewBasis.id} className="border-b border-[var(--elevated)] px-3 py-2.5 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                        <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium ${typeBg}`}>{formatReviewBasisType(reviewBasis.evidenceType)}</span>
                        <span title={quality.reason} className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium ${qualityBg}`}>{quality.label}</span>
                        <span className="text-[10px] text-[var(--faint)]">{formatReviewBasisSource(reviewBasis.source)}</span>
                      </div>
                      <span className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
                        {new Date(reviewBasis.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{normalizeInvestmentReviewBasisContent(reviewBasis.content)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)] p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
              <Shield className="h-3.5 w-3.5" /> 投资判断
            </h3>
            <p className="text-xs text-[var(--text)] leading-relaxed">{thread.thesisText}</p>
            {thread.invalidationConditions && (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2.5">
                <div className="mb-1 text-[10px] font-medium text-[var(--danger)]">失效条件</div>
                <p className="text-xs text-[var(--muted)]">{thread.invalidationConditions}</p>
              </div>
            )}
            {thread.reviewAt && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--faint)]">
                <Clock className="h-3 w-3" />
                下次复核：{new Date(thread.reviewAt).toLocaleDateString("zh-CN")}
              </div>
            )}
            {thread.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {thread.tags.map(tag => (
                  <span key={tag} className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">{tag}</span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--elevated)] bg-[var(--surface)] p-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
              <Clock className="h-3.5 w-3.5" /> 复核历史 ({reviews.length})
            </h3>
            {reviews.length === 0 ? (
              <p className="text-xs text-[var(--faint)]">暂无复核记录</p>
            ) : (
              <div className="space-y-2.5">
                {reviews.map(review => (
                  <div key={review.id} className="border-b border-[var(--elevated)] pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--faint)]">{new Date(review.createdAt).toLocaleDateString("zh-CN")}</span>
                      {review.accuracyScore != null && (
                        <span className="font-medium text-[var(--text)]">{(review.accuracyScore * 100).toFixed(0)}%</span>
                      )}
                    </div>
                    {review.accuracyScore != null && (
                      <progress
                        className="mt-1 h-1.5 w-full appearance-none overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] accent-[var(--indigo)] [&::-moz-progress-bar]:bg-[var(--indigo)] [&::-webkit-progress-bar]:bg-[var(--elevated)] [&::-webkit-progress-value]:bg-[var(--indigo)]"
                        max={100}
                        value={Math.min(100, Math.max(0, review.accuracyScore * 100))}
                        aria-label="复核准确率"
                      />
                    )}
                    {review.actualOutcome && <p className="mt-1.5 text-xs text-[var(--muted)]">{review.actualOutcome}</p>}
                    {review.lessonsLearned && (
                      <p className="mt-1 text-xs text-[var(--amber)]">经验：{review.lessonsLearned}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
