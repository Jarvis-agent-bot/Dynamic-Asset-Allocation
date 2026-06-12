"use client";

/**
 * 经验库 — 查看和清理长期复用的判断依据。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpenText, Loader2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceFilterChip,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

interface ExperienceRecord {
  id: string;
  kind: string;
  content: string;
  relevanceTags: string[];
  strength: number;
  createdAt: string;
  lastAccessed: string;
}

type ApiExperienceRecord = Omit<ExperienceRecord, "kind"> & {
  memoryType: string;
};

const EXPERIENCE_TYPE_FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "pattern", label: "判断模式" },
  { value: "lesson", label: "复核教训" },
  { value: "preference", label: "偏好约束" },
  { value: "fact", label: "事实记录" },
] as const;

const EXPERIENCE_TYPE_BADGE_CLASSES: Record<string, string> = {
  pattern: "bg-[var(--indigo-bg)] text-[var(--indigo)]",
  lesson: "bg-[var(--amber-bg)] text-[var(--amber)]",
  preference: "bg-[var(--primary-bg)] text-[var(--primary)]",
  fact: "bg-[var(--success-bg)] text-[var(--success)]",
};

const EXPERIENCE_RECORD_KIND_NAMES: Record<string, string> = {
  pattern: "判断模式",
  lesson: "复核教训",
  preference: "偏好约束",
  fact: "事实记录",
};

const PAGE_SIZE = 20;

function normalizeExperienceRecord(record: ApiExperienceRecord): ExperienceRecord {
  const { memoryType, ...rest } = record;
  return { ...rest, kind: memoryType };
}

export default function ExperienceLibraryClient() {
  const router = useRouter();
  const [experienceRecords, setExperienceRecords] = useState<ExperienceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [experienceTypeFilter, setExperienceTypeFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (experienceTypeFilter) params.set("type", experienceTypeFilter);
      const response = await fetch(`/api/daa/agent/memories?${params}`);
      // 丢弃过期请求的响应，避免快速切换过滤/翻页时旧结果覆盖新结果。
      if (reqId !== requestIdRef.current) return;
      if (response.ok) {
        const json = await response.json();
        const items = Array.isArray(json.data.items)
          ? json.data.items.map((item: ApiExperienceRecord) => normalizeExperienceRecord(item))
          : [];
        setExperienceRecords(items);
        setTotal(json.data.total);
      }
    } catch (error) {
      logSwallowed("today.experienceLibrary.load", error);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [experienceTypeFilter, offset]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条经验记录？此操作不可撤销。")) return;
    setDeletingRecordId(id);
    try {
      const response = await fetch(`/api/daa/agent/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) {
        alert("删除失败，请稍后重试。");
        return;
      }
      await load();
    } catch (error) {
      logSwallowed("today.experienceLibrary.delete", error);
      alert("删除失败，请检查网络后重试。");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleTypeChange = (type: string) => {
    setExperienceTypeFilter(type);
    setOffset(0);
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE);

  return (
    <DaaSurfacePanel
      accent="info"
      title={(
        <span className="inline-flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-[var(--indigo)]" />
          经验库
          <span className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-2 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {total} 条
          </span>
        </span>
      )}
      subtitle="可复用的判断模式、教训与事实记录。"
      action={(
        <DaaSurfaceActionButton
          tone="neutral"
          className="h-8 px-2.5 text-xs"
          onClick={() => router.push("/daa/dashboard/today")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回今日
        </DaaSurfaceActionButton>
      )}
    >
      <div className="space-y-4">
        <div className="flex gap-1.5 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          {EXPERIENCE_TYPE_FILTER_OPTIONS.map((experienceType) => (
            <DaaSurfaceFilterChip
              key={experienceType.value}
              active={experienceTypeFilter === experienceType.value}
              onClick={() => handleTypeChange(experienceType.value)}
            >
              {experienceType.label}
            </DaaSurfaceFilterChip>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted)]">正在加载经验记录…</span>
          </div>
        ) : experienceRecords.length === 0 ? (
          <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2">
            <div className="text-sm font-semibold text-[var(--text)]">暂无经验记录</div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">形成可复用判断后按时间显示。</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
            <div className="divide-y divide-[var(--border)]">
              {experienceRecords.map((experienceRecord) => (
                <article key={experienceRecord.id} className="group px-4 py-4 transition-colors hover:bg-[var(--surface)] sm:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold ${EXPERIENCE_TYPE_BADGE_CLASSES[experienceRecord.kind] ?? "bg-[var(--elevated)] text-[var(--faint)]"}`}>
                          {EXPERIENCE_RECORD_KIND_NAMES[experienceRecord.kind] ?? experienceRecord.kind}
                        </span>
                        <span className="text-[10px] text-[var(--faint)]">
                          形成于 {new Date(experienceRecord.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                        <span className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
                          复用权重 {experienceRecord.strength.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 max-w-[920px] text-[13px] leading-6 text-[var(--text)]">{experienceRecord.content}</p>
                      {experienceRecord.relevanceTags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {experienceRecord.relevanceTags.slice(0, 6).map((tag) => (
                            <span key={tag} className="rounded-[var(--radius-sm)] bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(experienceRecord.id)}
                      disabled={deletingRecordId === experienceRecord.id}
                      className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--faint)] opacity-0 transition-all hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-bg)] group-hover:opacity-100 disabled:opacity-50"
                      title="删除经验记录"
                    >
                      {deletingRecordId === experienceRecord.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> 上一页
            </button>
            <span className="text-xs text-[var(--faint)]">{currentPage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
            >
              下一页 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}
