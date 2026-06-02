"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquareText, RefreshCw, Send, User, X } from "lucide-react";

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
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <div className={cn("max-w-[82%] rounded-[14px] px-3.5 py-2.5 text-sm leading-6", isUser
        ? "bg-[var(--primary)] text-[var(--bg)]"
        : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
      )}>
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <div className={cn("mt-1 text-[10px]", isUser ? "text-[var(--surface)]" : "text-[var(--faint)]")}>
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
      {isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--primary-border)] bg-[var(--primary-bg)] text-[var(--primary)]">
          <User className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}

export default function FloatingAssistantChat() {
  const assistant = useAssistantChat();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(() => [
    "解释今天需要我复核的变化",
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
    : "Web 对话";

  const hasMessages = assistant.messages.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed right-5 top-[92px] z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-indigo-400/30 bg-[var(--surface)] text-[var(--text)] shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur transition-all hover:border-indigo-300/55 hover:text-[var(--text)]",
          open && "opacity-0 pointer-events-none",
        )}
        aria-label="打开 Agent 对话"
        title="和 Agent 对话"
      >
        <Bot className="h-4 w-4 text-indigo-300" />
        {hasMessages ? (
          <span className="absolute right-2 top-2 inline-flex h-1.5 w-1.5 rounded-full bg-indigo-300" />
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="Agent 对话"
            className="fixed right-6 top-[92px] z-50 flex w-[min(420px,calc(100vw-3rem))] max-h-[min(720px,calc(100vh-7rem))] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[linear-gradient(180deg,var(--elevated),var(--surface))] shadow-[0_30px_70px_rgba(0,0,0,0.5)]"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-indigo-400/70" />
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-300" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--text)]">和 Agent 对话</div>
                  <div className="flex items-center gap-1 text-[11px] text-[var(--faint)]">
                    <MessageSquareText className="h-3 w-3" />
                    <span className="truncate">{selectedThreadLabel}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <DaaSurfaceActionButton
                  tone="slate"
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
                <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-[var(--muted)]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  加载对话中...
                </div>
              ) : assistant.messages.length > 0 ? (
                assistant.messages.map((message) => (
                  <MessageBubble key={message.messageId} message={message} />
                ))
              ) : (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                  <Bot className="mb-3 h-8 w-8 text-[var(--faint)]" />
                  <div className="text-sm font-medium text-[var(--text)]">还没有 Web 对话</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">可以从复核项、仓位风险或调仓建议开始问。</div>
                </div>
              )}
              {assistant.sending ? (
                <div className="flex items-center gap-2 text-xs text-[var(--faint)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Agent 正在处理...
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {assistant.error ? (
              <div className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-xs leading-5 text-red-200">
                {assistant.error}
              </div>
            ) : null}

            <div className="border-t border-[var(--border)] px-4 pt-3 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-indigo-300/30 hover:text-[var(--text)] disabled:opacity-50"
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
                placeholder="例如：把今天的复核项按仓位影响排序"
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
