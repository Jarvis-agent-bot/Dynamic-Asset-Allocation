"use client";

/**
 * Memory Browser — Agent 记忆内省 UI
 *
 * 分页列表 + 类型过滤 + 删除
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, Loader2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceFilterChip,
  DaaSurfacePanel,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

interface AgentMemory {
  id: string;
  memoryType: string;
  content: string;
  relevanceTags: string[];
  strength: number;
  createdAt: string;
  lastAccessed: string;
}

const MEMORY_TYPES = [
  { value: "", label: "全部" },
  { value: "pattern", label: "模式" },
  { value: "lesson", label: "教训" },
  { value: "preference", label: "偏好" },
  { value: "fact", label: "事实" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  pattern: "bg-[var(--indigo-bg)] text-[var(--indigo)]",
  lesson: "bg-[var(--amber-bg)] text-[var(--amber)]",
  preference: "bg-[var(--primary-bg)] text-[var(--primary)]",
  fact: "bg-[var(--success-bg)] text-[var(--success)]",
};

const TYPE_LABELS: Record<string, string> = {
  pattern: "判断模式",
  lesson: "经验教训",
  preference: "用户偏好",
  fact: "事实记录",
};

const PAGE_SIZE = 20;

export default function MemoryBrowserClient() {
  const router = useRouter();
  const [items, setItems] = useState<AgentMemory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/daa/agent/memories?${params}`);
      // 丢弃过期请求的响应，避免快速切换过滤/翻页时旧结果覆盖新结果。
      if (reqId !== requestIdRef.current) return;
      if (res.ok) {
        const json = await res.json();
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch (error) {
      logSwallowed("today.memoryBrowser.load", error);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [typeFilter, offset]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记忆？此操作不可撤销。")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/daa/agent/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        alert("删除失败，请稍后重试。");
        return;
      }
      await load();
    } catch (error) {
      logSwallowed("today.memoryBrowser.delete", error);
      alert("删除失败，请检查网络后重试。");
    } finally {
      setDeleting(null);
    }
  };

  const handleTypeChange = (type: string) => {
    setTypeFilter(type);
    setOffset(0);
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE);

  return (
    <DaaSurfacePanel
      accent="indigo"
      title={(
        <span className="inline-flex items-center gap-2">
          <Brain className="h-4 w-4 text-[var(--indigo)]" />
          Agent 记忆
          <span className="rounded-full bg-[var(--elevated)] px-2 py-0.5 font-[var(--font-mono)] text-[11px] text-[var(--muted)]">
            {total} 条
          </span>
        </span>
      )}
      subtitle="这些是 Agent 长期保留的经验、偏好和事实；用于解释它为什么会形成某些判断。"
      action={(
        <DaaSurfaceActionButton
          tone="slate"
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
          {MEMORY_TYPES.map(t => (
            <DaaSurfaceFilterChip
              key={t.value}
              active={typeFilter === t.value}
              onClick={() => handleTypeChange(t.value)}
            >
              {t.label}
            </DaaSurfaceFilterChip>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">加载中...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-4 py-8 text-center">
            <div className="text-sm font-semibold text-[var(--text)]">暂无记忆</div>
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">Agent 形成可复用经验后，这里会按时间显示。</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]">
            <div className="divide-y divide-[var(--border)]">
              {items.map(m => (
                <article key={m.id} className="group px-4 py-4 transition-colors hover:bg-[var(--surface)] sm:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLORS[m.memoryType] ?? "bg-[var(--elevated)] text-[var(--faint)]"}`}>
                          {TYPE_LABELS[m.memoryType] ?? m.memoryType}
                        </span>
                        <span className="text-[10px] text-[var(--faint)]">
                          形成于 {new Date(m.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                        <span className="font-[var(--font-mono)] text-[10px] text-[var(--faint)]">
                          置信 {m.strength.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-2 max-w-[920px] text-[13px] leading-6 text-[var(--text)]">{m.content}</p>
                      {m.relevanceTags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.relevanceTags.slice(0, 6).map(tag => (
                            <span key={tag} className="rounded bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={deleting === m.id}
                      className="shrink-0 rounded p-1.5 text-[var(--faint)] opacity-0 transition-all hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-bg)] group-hover:opacity-100 disabled:opacity-50"
                      title="删除记忆"
                    >
                      {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> 上一页
            </button>
            <span className="text-xs text-[var(--faint)]">{currentPage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
            >
              下一页 <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}
