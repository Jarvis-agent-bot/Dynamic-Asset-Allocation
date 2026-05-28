"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageSquareText, RefreshCw, Send, User } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfacePanel,
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
        : "border border-[var(--border)] bg-[rgba(8,12,20,0.78)] text-[var(--text)]",
      )}>
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <div className={cn("mt-1 text-[10px]", isUser ? "text-[rgba(8,12,20,0.68)]" : "text-[var(--faint)]")}>
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
      {isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
          <User className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </div>
  );
}

export default function AssistantChatPanel() {
  const assistant = useAssistantChat();
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(() => [
    "解释今天需要我复核的变化",
    "哪些持仓论点最久没有有效更新？",
    "当前组合最大的风险暴露是什么？",
  ], []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [assistant.messages.length, assistant.sending]);

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

  return (
    <DaaSurfacePanel
      accent="indigo"
      title="和 Agent 对话"
      subtitle="直接追问组合、论点、风险与调仓建议；需要下单或执行调仓时仍会走确认流程。"
      action={(
        <DaaSurfaceActionButton
          tone="slate"
          className="h-8 px-2.5 text-xs"
          onClick={() => void assistant.refresh()}
          disabled={assistant.loading || assistant.sending}
          title="刷新对话"
        >
          {assistant.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          刷新
        </DaaSurfaceActionButton>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--faint)]">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-3.5 w-3.5 text-indigo-300" />
            <span>{selectedThreadLabel}</span>
          </div>
          {assistant.threads.length > 1 ? (
            <select
              className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(8,12,20,0.78)] px-2 text-xs text-[var(--muted)] outline-none"
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
          ) : null}
        </div>

        <div className="max-h-[420px] min-h-[220px] space-y-3 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(8,12,20,0.52)] p-3">
          {assistant.loading && assistant.messages.length === 0 ? (
            <div className="flex h-[188px] items-center justify-center text-sm text-[var(--muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载对话中...
            </div>
          ) : assistant.messages.length > 0 ? (
            assistant.messages.map((message) => (
              <MessageBubble key={message.messageId} message={message} />
            ))
          ) : (
            <div className="flex h-[188px] flex-col items-center justify-center text-center">
              <Bot className="mb-3 h-8 w-8 text-[var(--faint)]" />
              <div className="text-sm font-medium text-[var(--text)]">还没有 Web 对话</div>
              <div className="mt-1 text-xs leading-5 text-[var(--muted)]">可以从组合状态、论点复核或调仓建议开始问。</div>
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
          <div className="rounded-[var(--radius-md)] border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
            {assistant.error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-indigo-300/30 hover:text-[var(--text)] disabled:opacity-50"
              onClick={() => setDraft(prompt)}
              disabled={assistant.sending}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2 sm:flex-row">
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
            className={cn(daaSurfaceFieldClassName, "min-h-[44px] resize-none py-2.5 sm:min-h-0")}
            disabled={assistant.sending}
          />
          <DaaSurfaceActionButton
            tone="primary"
            className="h-11 justify-center sm:w-[108px]"
            disabled={!draft.trim() || assistant.sending}
            type="submit"
          >
            {assistant.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            发送
          </DaaSurfaceActionButton>
        </form>
      </div>
    </DaaSurfacePanel>
  );
}
