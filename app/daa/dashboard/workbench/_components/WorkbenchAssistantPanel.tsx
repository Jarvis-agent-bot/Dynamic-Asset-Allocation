"use client";

import { useState } from "react";
import { Bot, SendHorizonal, Sparkles } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceDenseFieldClassName,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { AssistantChatModel } from "@/app/daa/dashboard/_hooks/useAssistantChat";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "组合状态",
  "市场状态",
  "风险状态",
  "最近一次调仓",
  "生成调仓建议",
];

const COMMAND_HINTS = [
  "执行类命令先进入待确认，回复“确认”后才真正执行。",
  "支持查询组合、市场、风险、最近调仓与生成调仓建议。",
  "支持自然语言买入/卖出模拟单，例如“买入 QQQ 10股”。",
];

function messageTone(role: "user" | "assistant" | "system") {
  if (role === "assistant") return "cyan" as const;
  if (role === "system") return "amber" as const;
  return "slate" as const;
}

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkbenchAssistantPanel(props: {
  assistant: AssistantChatModel;
}) {
  const [draft, setDraft] = useState("");
  const conversation = props.assistant.conversation;
  const recentThreads = props.assistant.threads.slice(0, 5);
  const selectedThread = conversation?.selectedThread || props.assistant.threads[0] || null;
  const activeThread = conversation?.activeThread || null;
  const viewingForeignThread = Boolean(conversation?.isPreviewingOtherThread);

  function submit(text: string) {
    const next = String(text || "").trim();
    if (!next || props.assistant.sending) return;
    setDraft("");
    void props.assistant.send(next);
  }

  return (
    <DaaSurfacePanel
      accent="green"
      title="交易助手"
      subtitle="把查询、调仓建议和待确认执行收进工作台，Web 与 Telegram 共用同一套上下文。"
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <DaaSurfaceStatusPill tone={props.assistant.loading ? "slate" : props.assistant.error ? "amber" : "green"}>
            {props.assistant.loading ? "同步中" : props.assistant.error ? "待排查" : "已就绪"}
          </DaaSurfaceStatusPill>
          <DaaSurfaceActionButton tone="slate" onClick={() => void props.assistant.refresh()} disabled={props.assistant.loading || props.assistant.sending}>
            <Sparkles className="h-3.5 w-3.5" />
            刷新会话
          </DaaSurfaceActionButton>
        </div>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-3">
          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                  <Bot className="h-3.5 w-3.5" />
                  助手输入
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  直接输入自然语言即可。当前以查询、生成调仓和待确认执行为主，不再要求记住一长串固定命令。
                </div>
              </div>
              <DaaSurfaceStatusPill tone="indigo">Web + Telegram 共用会话</DaaSurfaceStatusPill>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submit(draft);
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="例如：生成调仓建议 / 当前风险状态 / 买入 QQQ 10股"
                className={cn(daaSurfaceDenseFieldClassName, "h-10 flex-1 rounded-[14px] text-sm")}
              />
              <DaaSurfaceActionButton type="submit" disabled={props.assistant.sending || !draft.trim()}>
                <SendHorizonal className="h-3.5 w-3.5" />
                {props.assistant.sending ? "处理中…" : "发送"}
              </DaaSurfaceActionButton>
            </form>
            {props.assistant.error ? <div className="mt-3 text-xs text-amber-300">{props.assistant.error}</div> : null}
          </div>

          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                {selectedThread ? `线程消息 · ${selectedThread.sourceLabel}` : "最近消息"}
              </div>
              <DaaSurfaceStatusPill tone="cyan">
                {(props.assistant.messages || []).length} 条
              </DaaSurfaceStatusPill>
            </div>
            {viewingForeignThread ? (
              <div className="mt-3 rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs leading-5 text-[var(--muted)]">
                当前正在查看其他线程历史。输入框发送的内容仍会进入当前 Web 会话。
              </div>
            ) : null}
            <div className="mt-3 space-y-3">
              {(props.assistant.messages || []).length > 0 ? (
                props.assistant.messages.slice(-8).map((item) => (
                  <div key={item.messageId} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <DaaSurfaceStatusPill tone={messageTone(item.role)}>
                        {item.role === "assistant" ? "助手" : item.role === "system" ? "系统" : "你"}
                      </DaaSurfaceStatusPill>
                      {item.intentKind ? <DaaSurfaceStatusPill tone="slate">{item.intentKind}</DaaSurfaceStatusPill> : null}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{item.body}</div>
                  </div>
                ))
              ) : (
                <DaaSurfaceEmptyState
                  className="border-0 bg-transparent px-0 py-8"
                  title="还没有助手会话"
                  description="从这里发第一条消息后，Web 和 Telegram 的最近互动都会在这里留痕。"
                />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">当前上下文</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DaaSurfaceStatusPill tone={selectedThread?.channel === "telegram" ? "indigo" : "green"}>
                    {selectedThread?.sourceLabel || "暂无会话"}
                  </DaaSurfaceStatusPill>
                  {selectedThread?.lastIntentKind ? <DaaSurfaceStatusPill tone="slate">{selectedThread.lastIntentKind}</DaaSurfaceStatusPill> : null}
                </div>
                <div className="mt-2 text-sm text-[var(--text)]">
                  {selectedThread?.title || "还没有可复用的会话标题"}
                </div>
                <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  {selectedThread?.latestSnippet || "首次对话后，这里会显示最近一轮会话摘要。"}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] md:grid-cols-2">
                  <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">当前查看</div>
                    <div className="mt-1 text-[var(--text)]">
                      {selectedThread?.sourceLabel || "暂无线程"}{selectedThread?.threadLabel ? ` · ${selectedThread.threadLabel}` : ""}
                    </div>
                    <div className="mt-1">最近更新时间 {formatTimeLabel(selectedThread?.latestMessageAt || null)}</div>
                  </div>
                  <div className="rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">发送目标</div>
                    <div className="mt-1 text-[var(--text)]">
                      {activeThread?.sourceLabel || "当前 Web 会话尚未建立"}{activeThread?.threadLabel ? ` · ${activeThread.threadLabel}` : ""}
                    </div>
                    <div className="mt-1">
                      {activeThread ? `新消息会写入 ${activeThread.sourceLabel} 会话。` : "发送第一条 Web 消息后会在这里固定输入目标。"}
                    </div>
                  </div>
                </div>
                {conversation ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <DaaSurfaceStatusPill tone="slate">{conversation.stats.threadCount} 个最近线程</DaaSurfaceStatusPill>
                    <DaaSurfaceStatusPill tone="slate">Web {conversation.stats.webThreadCount}</DaaSurfaceStatusPill>
                    <DaaSurfaceStatusPill tone="slate">Telegram {conversation.stats.telegramThreadCount}</DaaSurfaceStatusPill>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">最近线程</div>
              <DaaSurfaceStatusPill tone="slate">{recentThreads.length} 个</DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 space-y-2">
              {recentThreads.length > 0 ? recentThreads.map((thread) => (
                <button
                  key={thread.threadKey}
                  type="button"
                  onClick={() => void props.assistant.selectThread(thread.sessionId)}
                  className={cn(
                    "w-full rounded-[14px] border bg-[rgba(8,12,20,0.58)] p-3 text-left transition-colors",
                    props.assistant.selectedSessionId === thread.sessionId
                      ? "border-[var(--primary)]/40 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
                      : "border-[var(--border)] hover:border-[var(--primary)]/20",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <DaaSurfaceStatusPill tone={thread.channel === "telegram" ? "indigo" : "green"}>
                      {thread.sourceLabel}
                    </DaaSurfaceStatusPill>
                    <DaaSurfaceStatusPill tone="slate">{thread.threadLabel}</DaaSurfaceStatusPill>
                    {thread.lastIntentKind ? <DaaSurfaceStatusPill tone="slate">{thread.lastIntentKind}</DaaSurfaceStatusPill> : null}
                  </div>
                  <div className="mt-2 text-sm text-[var(--text)]">{thread.title || "未命名线程"}</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    {thread.latestSnippet || "还没有最近消息摘要。"}
                  </div>
                </button>
              )) : (
                <DaaSurfaceEmptyState
                  className="border-0 bg-transparent px-0 py-6"
                  title="还没有线程"
                  description="Web 与 Telegram 产生会话后，这里会按线程展示最近上下文。"
                />
              )}
            </div>
          </div>

          <div className={cn(daaSurfaceSubtlePanelClassName, "p-4")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">操作说明</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {COMMAND_HINTS.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DaaSurfacePanel>
  );
}
