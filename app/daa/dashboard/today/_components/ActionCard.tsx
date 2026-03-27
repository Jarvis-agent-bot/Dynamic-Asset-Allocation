"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";
import type { TodayActionItem, TodayConclusion } from "@/src/daa/modules/today/todayTypes";

type Props = {
  item: TodayActionItem;
  overallConclusion: TodayConclusion;
  onDecision: (
    assetKey: string,
    conclusion: string,
    userAction: string,
    llmReason?: string,
  ) => void;
};

export default function ActionCard({ item, overallConclusion, onDecision }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [acted, setActed] = useState<string | null>(null);

  const isDivergent = overallConclusion !== "act";

  const handleAction = (action: "adopted" | "ignored" | "deferred") => {
    setActed(action);
    onDecision(item.assetKey, "act", action, item.rationale);
  };

  return (
    <div
      className={`rounded-lg border bg-card p-4 transition ${
        acted ? "opacity-60" : "hover:shadow-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{item.assetKey}</span>
            {isDivergent && (
              <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Zap className="h-2.5 w-2.5" />
                与整体结论不同
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground/80">{item.suggestedAction}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            置信 {item.confidence}%
          </span>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "收起" : "展开证据"}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground leading-relaxed">
          {item.rationale}
        </div>
      )}

      {/* Action buttons */}
      {!acted ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleAction("adopted")}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground
                       transition hover:bg-primary/90"
          >
            采纳
          </button>
          <button
            onClick={() => handleAction("ignored")}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground
                       transition hover:bg-muted"
          >
            忽略
          </button>
          <button
            onClick={() => handleAction("deferred")}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground
                       transition hover:bg-muted"
          >
            稍后
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          已{acted === "adopted" ? "采纳" : acted === "ignored" ? "忽略" : "稍后处理"}
        </p>
      )}
    </div>
  );
}
