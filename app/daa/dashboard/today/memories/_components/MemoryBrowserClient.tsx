"use client";

/**
 * Memory Browser — Agent 记忆内省 UI
 *
 * 分页列表 + 类型过滤 + 删除
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Brain, Loader2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

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
  pattern: "bg-purple-500/15 text-purple-400",
  lesson: "bg-amber-500/15 text-amber-400",
  preference: "bg-blue-500/15 text-blue-400",
  fact: "bg-[var(--success-bg)] text-[var(--success)]",
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/daa/agent/memories?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [typeFilter, offset]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记忆？此操作不可撤销。")) return;
    setDeleting(id);
    try {
      await fetch(`/api/daa/agent/memories?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch {
      // silent
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
    <div className="space-y-6">
      {/* 返回 + 标题 */}
      <div>
        <button type="button" onClick={() => router.push("/daa/dashboard/today")}
          className="mb-3 flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回日报
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-400" />
            <h1 className="text-lg font-semibold text-[var(--text)]">Agent 记忆</h1>
            <span className="rounded-full bg-[var(--elevated)] px-2 py-0.5 text-xs text-[var(--muted)]">
              {total} 条
            </span>
          </div>
        </div>
      </div>

      {/* 类型过滤 */}
      <div className="flex gap-1.5">
        {MEMORY_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => handleTypeChange(t.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === t.value
                ? "bg-indigo-600 text-white"
                : "bg-[var(--elevated)] text-[var(--muted)] hover:bg-[var(--hover)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
          <span className="text-sm text-[var(--muted)]">加载中...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--hover)] bg-[var(--surface)] p-8 text-center">
          <Brain className="mx-auto mb-3 h-10 w-10 text-[var(--faint)]" />
          <p className="text-sm text-[var(--muted)]">暂无记忆</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <div key={m.id} className="group rounded-lg border border-[var(--elevated)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--elevated)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLORS[m.memoryType] ?? "bg-[var(--elevated)] text-[var(--faint)]"}`}>
                      {m.memoryType}
                    </span>
                    <span className="text-[10px] text-[var(--faint)]">
                      强度 {m.strength.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-[var(--faint)]">
                      {new Date(m.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text)] leading-relaxed">{m.content}</p>
                  {m.relevanceTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.relevanceTags.slice(0, 5).map(tag => (
                        <span key={tag} className="rounded bg-[var(--elevated)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={deleting === m.id}
                  className="shrink-0 rounded p-1.5 text-[var(--faint)] opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                  title="删除记忆"
                >
                  {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
              {/* 强度条 */}
              <div className="mt-2 h-1 rounded-full bg-[var(--elevated)]">
                <div className="h-full rounded-full bg-indigo-500/60 transition-all" style={{ width: `${Math.min(m.strength * 50, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> 上一页
          </button>
          <span className="text-xs text-[var(--faint)]">{currentPage + 1} / {pageCount}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--elevated)] disabled:opacity-30"
          >
            下一页 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
