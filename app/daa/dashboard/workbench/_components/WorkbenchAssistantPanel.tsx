"use client";

import { useMemo, useState } from "react";
import { Bot, SendHorizonal, Sparkles } from "lucide-react";

import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerDenseFieldClassName,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
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

export function WorkbenchAssistantPanel(props: {
  assistant: AssistantChatModel;
}) {
  const [draft, setDraft] = useState("");
  const latestSession = useMemo(() => props.assistant.sessions[0] || null, [props.assistant.sessions]);

  function submit(text: string) {
    const next = String(text || "").trim();
    if (!next || props.assistant.sending) return;
    setDraft("");
    void props.assistant.send(next);
  }

  return (
    <DeepLedgerPanel
      accent="green"
      title="交易助手"
      subtitle="把查询、调仓建议和待确认执行收进工作台，Web 与 Telegram 共用同一套上下文。"
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <DeepLedgerStatusPill tone={props.assistant.loading ? "slate" : props.assistant.error ? "amber" : "green"}>
            {props.assistant.loading ? "同步中" : props.assistant.error ? "待排查" : "已就绪"}
          </DeepLedgerStatusPill>
          <DeepLedgerActionButton tone="slate" onClick={() => void props.assistant.refresh()} disabled={props.assistant.loading || props.assistant.sending}>
            <Sparkles className="h-3.5 w-3.5" />
            刷新会话
          </DeepLedgerActionButton>
        </div>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-3">
          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
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
              <DeepLedgerStatusPill tone="indigo">Web + Telegram 共用会话</DeepLedgerStatusPill>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submit(prompt)}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-3 text-xs font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/30 hover:text-[var(--text)]"
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
                className={cn(deepLedgerDenseFieldClassName, "h-10 flex-1 rounded-[14px] text-sm")}
              />
              <DeepLedgerActionButton type="submit" disabled={props.assistant.sending || !draft.trim()}>
                <SendHorizonal className="h-3.5 w-3.5" />
                {props.assistant.sending ? "处理中…" : "发送"}
              </DeepLedgerActionButton>
            </form>
            {props.assistant.error ? <div className="mt-3 text-xs text-amber-300">{props.assistant.error}</div> : null}
          </div>

          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">最近消息</div>
              <DeepLedgerStatusPill tone="cyan">
                {(props.assistant.messages || []).length} 条
              </DeepLedgerStatusPill>
            </div>
            <div className="mt-3 space-y-3">
              {(props.assistant.messages || []).length > 0 ? (
                props.assistant.messages.slice(-8).map((item) => (
                  <div key={item.messageId} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <DeepLedgerStatusPill tone={messageTone(item.role)}>
                        {item.role === "assistant" ? "助手" : item.role === "system" ? "系统" : "你"}
                      </DeepLedgerStatusPill>
                      {item.intentKind ? <DeepLedgerStatusPill tone="slate">{item.intentKind}</DeepLedgerStatusPill> : null}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{item.body}</div>
                  </div>
                ))
              ) : (
                <DeepLedgerEmptyState
                  className="border-0 bg-transparent px-0 py-8"
                  title="还没有助手会话"
                  description="从这里发第一条消息后，Web 和 Telegram 的最近互动都会在这里留痕。"
                />
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">当前上下文</div>
            <div className="mt-3 space-y-3">
              <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DeepLedgerStatusPill tone={latestSession?.channel === "telegram" ? "indigo" : "green"}>
                    {latestSession ? (latestSession.channel === "telegram" ? "Telegram" : "Web") : "暂无会话"}
                  </DeepLedgerStatusPill>
                  {latestSession?.lastIntentKind ? <DeepLedgerStatusPill tone="slate">{latestSession.lastIntentKind}</DeepLedgerStatusPill> : null}
                </div>
                <div className="mt-2 text-sm text-[var(--text)]">
                  {latestSession?.title || "还没有可复用的会话标题"}
                </div>
                <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
                  {latestSession?.lastAssistantText || latestSession?.lastUserText || "首次对话后，这里会显示最近一轮会话摘要。"}
                </div>
              </div>
            </div>
          </div>

          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">操作说明</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              {COMMAND_HINTS.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DeepLedgerPanel>
  );
}
