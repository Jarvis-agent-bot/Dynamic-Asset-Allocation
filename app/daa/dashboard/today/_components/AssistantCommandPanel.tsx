"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquareText, RefreshCw, Send, User, X } from "lucide-react";

import {
  DaaSurfaceActionButton,
  daaSurfaceFieldClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { useAssistantChat } from "@/app/daa/dashboard/_hooks/useAssistantChat";
import { cn } from "@/lib/utils";
import type { DaaChatMessage } from "@/src/daa/chat/chatTypes";

function formatMessageTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ message }: { message: DaaChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]">
          <MessageSquareText className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <div className={cn("max-w-[82%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm leading-6", isUser
        ? "bg-[var(--primary)] text-[var(--bg)]"
        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
      )}>
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <div className={cn("mt-1 text-[10px]", isUser ? "text-[var(--surface)]" : "text-[var(--faint)]")}>
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
      {isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]">
          <User className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}

export default function AssistantCommandPanel() {
  const assistant = useAssistantChat();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(() => [
    "解释今天有没有需要我拍板的动作",
    "哪些持仓最需要复核？",
    "当前组合最大的风险暴露是什么？",
  ], []);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [open, assistant.messages.length, assistant.sending]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || assistant.sending) return;
    setDraft("");
    await assistant.send(text);
  }

  const selectedThreadLabel = assistant.conversation?.selectedThread
    ? `${assistant.conversation.selectedThread.sourceLabel} · ${assistant.conversation.selectedThread.threadLabel}`
    : "当前对话";

  const hasMessages = assistant.messages.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-5 top-[92px] z-40 inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--primary-border)] bg-[var(--card)] px-2.5 text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--primary)]/45 hover:bg-[var(--surface)]",
          hasMessages && "border-[var(--primary)]/60",
          open && "opacity-0 pointer-events-none",
        )}
        aria-label="打开复核问答面板"
        title="打开复核问答面板"
      >
        <MessageSquareText className="h-3.5 w-3.5 text-[var(--primary)]" />
        <span className="hidden sm:inline">复核问答</span>
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="复核问答面板"
            className="fixed right-6 top-[76px] z-50 flex w-[min(420px,calc(100vw-3rem))] max-h-[min(720px,calc(100vh-6rem))] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-[var(--primary)]" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">复核问答</div>
                  <div className="flex items-center gap-1 text-[11px] text-[var(--faint)]">
                    <MessageSquareText className="h-3 w-3" />
                    <span className="truncate">{selectedThreadLabel}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <DaaSurfaceActionButton
                  tone="neutral"
                  className="h-8 px-2 text-xs"
                  onClick={() => void assistant.refresh()}
                  disabled={assistant.loading || assistant.sending}
                  title="刷新对话"
                >
                  {assistant.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </DaaSurfaceActionButton>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                  aria-label="关闭对话"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </header>

            {assistant.threads.length > 1 ? (
              <div className="border-b border-[var(--border)] px-4 py-2">
                <select
                  className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--muted)] outline-none"
                  value={assistant.selectedSessionId || ""}
                  onChange={(event) => void assistant.selectThread(event.target.value)}
                  disabled={assistant.sending}
                  aria-label="选择对话线程"
                >
                  {assistant.threads.map((thread) => (
                    <option key={thread.sessionId} value={thread.sessionId}>
                      {thread.sourceLabel} · {thread.threadLabel}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {assistant.loading && assistant.messages.length === 0 ? (
                <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                  <span>加载对话中...</span>
                </div>
              ) : assistant.messages.length > 0 ? (
                assistant.messages.map((message) => (
                  <MessageBubble key={message.messageId} message={message} />
                ))
              ) : (
                <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <MessageSquareText className="mt-0.5 h-3.5 w-3.5 text-[var(--primary)]" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text)]">等待指令</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--muted)]">从待复核事项、仓位风险或组合动作开始。</div>
                    </div>
                  </div>
                </div>
              )}
              {assistant.sending ? (
                <div className="flex items-center gap-2 text-xs text-[var(--faint)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在生成复核答复...
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {assistant.error ? (
              <div className="border-t border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2 text-xs leading-5 text-[var(--danger)]">
                {assistant.error}
              </div>
            ) : null}

            <div className="border-t border-[var(--border)] px-4 pt-3 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--primary)]/35 hover:text-[var(--text)] disabled:opacity-50"
                    onClick={() => setDraft(prompt)}
                    disabled={assistant.sending}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="例如：把今天的待复核事项按仓位影响排序"
                className={cn(daaSurfaceFieldClassName, "min-h-[40px] resize-none py-2")}
                disabled={assistant.sending}
              />
              <DaaSurfaceActionButton
                tone="primary"
                className="h-10 w-10 shrink-0 justify-center px-0"
                disabled={!draft.trim() || assistant.sending}
                type="submit"
                aria-label="发送"
              >
                {assistant.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </DaaSurfaceActionButton>
            </form>
          </aside>
        </>
      ) : null}
    </>
  );
}
