"use client";

/**
 * Thesis 详情页 — 显示证据链时间线 + 论点信息 + 复盘历史
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Shield, Target, Clock, CheckCircle, XCircle, MinusCircle } from "lucide-react";

import { deriveEvidenceQuality, normalizeAgentEvidenceContent } from "@/src/daa/agent/evidenceText";

interface EvidenceItem {
  id: string;
  evidenceType: string;
  source: string;
  content: string;
  dataSnapshot?: Record<string, unknown> | null;
  confidence: number;
  createdAt: string;
}

interface ThesisReview {
  id: string;
  reviewWindow: string;
  thesisAtTime: string;
  convictionAtTime: string;
  actualOutcome: string | null;
  accuracyScore: number | null;
  lessonsLearned: string | null;
  createdAt: string;
}

interface ResearchThread {
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

interface ThesisDetail {
  thread: ResearchThread;
  evidence: EvidenceItem[];
  reviews: ThesisReview[];
}

export default function ThesisDetailClient({ thesisId }: { thesisId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ThesisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/daa/agent/thesis/${encodeURIComponent(thesisId)}`);
      if (!res.ok) {
        setError(res.status === 404 ? "论点不存在" : `加载失败 (${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json.data);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [thesisId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
        <span className="text-sm text-[var(--muted)]">加载论点详情...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 py-12 text-center">
        <div className="text-sm text-[var(--muted)]">{error || "论点不存在"}</div>
        <button type="button" onClick={() => router.push("/daa/dashboard/today")}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]">
          返回日报
        </button>
      </div>
    );
  }

  const { thread, evidence, reviews } = data;
  const convictionColor =
    thread.conviction === "high" ? "text-[var(--success)] bg-[var(--success-bg)]" :
    thread.conviction === "medium" ? "text-amber-400 bg-amber-500/10" :
    thread.conviction === "low" ? "text-red-400 bg-red-500/10" : "text-[var(--faint)] bg-[var(--elevated)]";

  return (
    <div className="space-y-6">
      {/* 返回按钮 + 标题 */}
      <div>
        <button type="button" onClick={() => router.push("/daa/dashboard/today")}
          className="mb-3 flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回日报
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text)]">{thread.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--faint)]">
              <span>{thread.assetKeys.join(", ")}</span>
              <span>·</span>
              <span>创建于 {new Date(thread.createdAt).toLocaleDateString("zh-CN")}</span>
              <span>·</span>
              <span>更新于 {new Date(thread.updatedAt).toLocaleDateString("zh-CN")}</span>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${convictionColor}`}>
            {thread.conviction}
          </span>
        </div>
      </div>

      {/* 两列布局 */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 左列：证据时间线 */}
        <div className="space-y-4">
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <Target className="h-3.5 w-3.5" />
            证据时间线 ({evidence.length})
          </h2>
          {evidence.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--hover)] p-6 text-center text-xs text-[var(--faint)]">
              暂无证据记录
            </div>
          ) : (
            <div className="relative space-y-0 border-l border-[var(--hover)] pl-4">
              {evidence.map((e) => {
                const Icon = e.evidenceType === "supporting" ? CheckCircle :
                  e.evidenceType === "contradicting" ? XCircle : MinusCircle;
                const iconColor = e.evidenceType === "supporting" ? "text-[var(--success)]" :
                  e.evidenceType === "contradicting" ? "text-red-400" : "text-[var(--faint)]";
                const typeBg = e.evidenceType === "supporting" ? "bg-[var(--success-bg)] text-[var(--success)]" :
                  e.evidenceType === "contradicting" ? "bg-red-500/10 text-red-400" : "bg-[var(--elevated)] text-[var(--faint)]";
                const quality = deriveEvidenceQuality(e);
                const qualityBg = quality.level === "high"
                  ? "bg-[var(--success-bg)] text-[var(--success)]"
                  : quality.level === "medium"
                    ? "bg-[var(--primary-bg)] text-[var(--primary)]"
                    : "bg-amber-500/10 text-amber-300";
                return (
                  <div key={e.id} className="relative pb-4">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)] bg-[var(--hover)]" />
                    <div className="rounded-lg border border-[var(--elevated)] bg-[var(--surface)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBg}`}>{e.evidenceType}</span>
                          <span title={quality.reason} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${qualityBg}`}>{quality.label}</span>
                          <span className="text-[10px] text-[var(--faint)]">{e.source}</span>
                        </div>
                        <span className="text-[10px] text-[var(--faint)]">
                          {new Date(e.createdAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--muted)] leading-relaxed">{normalizeAgentEvidenceContent(e.content)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右列：论点信息 + 复盘 */}
        <div className="space-y-4">
          {/* 论点信息卡 */}
          <div className="rounded-xl border border-[var(--elevated)] bg-[var(--surface)] p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
              <Shield className="h-3.5 w-3.5" /> 论点
            </h3>
            <p className="text-xs text-[var(--text)] leading-relaxed">{thread.thesisText}</p>
            {thread.invalidationConditions && (
              <div className="mt-3 rounded-lg bg-red-500/5 border border-red-500/10 p-2.5">
                <div className="text-[10px] font-medium text-red-400 mb-1">失效条件</div>
                <p className="text-xs text-[var(--muted)]">{thread.invalidationConditions}</p>
              </div>
            )}
            {thread.reviewAt && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--faint)]">
                <Clock className="h-3 w-3" />
                下次复盘: {new Date(thread.reviewAt).toLocaleDateString("zh-CN")}
              </div>
            )}
            {thread.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {thread.tags.map(tag => (
                  <span key={tag} className="rounded bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* 复盘历史 */}
          <div className="rounded-xl border border-[var(--elevated)] bg-[var(--surface)] p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
              <Clock className="h-3.5 w-3.5" /> 复盘历史 ({reviews.length})
            </h3>
            {reviews.length === 0 ? (
              <p className="text-xs text-[var(--faint)]">暂无复盘记录</p>
            ) : (
              <div className="space-y-3">
                {reviews.map(r => (
                  <div key={r.id} className="border-b border-[var(--elevated)] pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[var(--faint)]">{new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
                      {r.accuracyScore != null && (
                        <span className="font-medium text-[var(--text)]">{(r.accuracyScore * 100).toFixed(0)}%</span>
                      )}
                    </div>
                    {r.accuracyScore != null && (
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--elevated)]">
                        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${r.accuracyScore * 100}%` }} />
                      </div>
                    )}
                    {r.actualOutcome && <p className="mt-1.5 text-xs text-[var(--muted)]">{r.actualOutcome}</p>}
                    {r.lessonsLearned && (
                      <p className="mt-1 text-xs text-amber-400/80">💡 {r.lessonsLearned}</p>
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
