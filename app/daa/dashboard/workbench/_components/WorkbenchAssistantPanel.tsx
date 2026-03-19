"use client";

import { useMemo, useState } from "react";
import { Bot, MessageSquareText, SendHorizonal, Sparkles, TerminalSquare } from "lucide-react";

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

function messageTone(role: "user" | "assistant" | "system") {
  if (role === "assistant") return "cyan" as const;
  if (role === "system") return "amber" as const;
  return "slate" as const;
}

export function WorkbenchAssistantPanel(props: {
  assistant: AssistantChatModel;
}) {
  const [draft, setDraft] = useState("");
  const recentSessions = useMemo(() => props.assistant.sessions.slice(0, 4), [props.assistant.sessions]);

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
      subtitle="把查询、生成调仓、模拟买卖和最近会话直接收进工作台，不再让 Telegram 和 Dashboard 各说各话。"
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
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-3">
          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                  <Bot className="h-3.5 w-3.5" />
                  Assistant Input
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  直接输入自然语言，或者用明确命令。
                  目前支持：状态查询、生成调仓、执行调仓、模拟买卖。
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
                placeholder="例如：买入 QQQ 10股 / 生成调仓建议 / 当前风险状态"
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">Recent Messages</div>
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
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
              <MessageSquareText className="h-3.5 w-3.5" />
              Recent Sessions
            </div>
            <div className="mt-3 space-y-3">
              {recentSessions.length > 0 ? (
                recentSessions.map((session) => (
                  <div key={session.sessionId} className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <DeepLedgerStatusPill tone={session.channel === "telegram" ? "indigo" : "green"}>
                        {session.channel === "telegram" ? "Telegram" : "Web"}
                      </DeepLedgerStatusPill>
                      {session.lastIntentKind ? <DeepLedgerStatusPill tone="slate">{session.lastIntentKind}</DeepLedgerStatusPill> : null}
                    </div>
                    <div className="mt-2 text-sm text-[var(--text)]">{session.title || "未命名会话"}</div>
                    <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      {session.lastAssistantText || session.lastUserText || "还没有有效消息内容"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[var(--muted)]">当前还没有任何会话记录。</div>
              )}
            </div>
          </div>

          <div className={cn(deepLedgerSubtlePanelClassName, "p-4")}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
              <TerminalSquare className="h-3.5 w-3.5" />
              Direct Commands
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              <div>`组合状态` 查看组合与现金。</div>
              <div>`市场状态` 查看市场状态层和行情健康。</div>
              <div>`生成调仓建议` 生成一轮新的再平衡周期。</div>
              <div>`执行调仓` 直接执行最近一轮周期。</div>
              <div>`买入 QQQ 10股` / `卖出 AAPL 5股` 直接走模拟执行。</div>
            </div>
          </div>
        </div>
      </div>
    </DeepLedgerPanel>
  );
}
