"use client";

import { AlertTriangle, CheckCircle2, Eye, Clock } from "lucide-react";
import type { TodayLlmOutput } from "@/src/daa/modules/today/todayTypes";

const CONCLUSION_CONFIG = {
  act: {
    label: "ACT",
    sublabel: "建议行动",
    icon: AlertTriangle,
    bgClass: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
    textClass: "text-orange-700 dark:text-orange-400",
    iconClass: "text-orange-500",
  },
  watch: {
    label: "WATCH",
    sublabel: "保持关注",
    icon: Eye,
    bgClass: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
    textClass: "text-blue-700 dark:text-blue-400",
    iconClass: "text-blue-500",
  },
  hold: {
    label: "HOLD",
    sublabel: "维持现状",
    icon: CheckCircle2,
    bgClass: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
    textClass: "text-green-700 dark:text-green-400",
    iconClass: "text-green-500",
  },
} as const;

type Props = {
  llmOutput: TodayLlmOutput;
  isStale: boolean;
};

export default function ConclusionCard({ llmOutput, isStale }: Props) {
  const config = CONCLUSION_CONFIG[llmOutput.conclusion] ?? CONCLUSION_CONFIG.watch;
  const Icon = config.icon;
  const isDegraded = llmOutput.status === "degraded" || llmOutput.status === "error";

  return (
    <div className={`flex-1 rounded-xl border p-5 ${config.bgClass}`}>
      {/* 状态标签 */}
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`h-6 w-6 ${config.iconClass}`} />
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold tracking-tight ${config.textClass}`}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">{config.sublabel}</span>
          </div>
        </div>
        {(isStale || isDegraded) && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {isDegraded ? "AI 离线" : "数据较旧"}
          </span>
        )}
      </div>

      {/* 原因 */}
      <p className="text-sm text-foreground/80 leading-relaxed">{llmOutput.reason}</p>

      {/* 分歧与风险（可折叠的简洁展示） */}
      {(llmOutput.dissent || llmOutput.riskWarning) && (
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {llmOutput.dissent && (
            <p>
              <span className="font-medium">分歧：</span>
              {llmOutput.dissent}
            </p>
          )}
          {llmOutput.riskWarning && (
            <p>
              <span className="font-medium">风险：</span>
              {llmOutput.riskWarning}
            </p>
          )}
          {llmOutput.missingInfo && (
            <p>
              <span className="font-medium">缺失：</span>
              {llmOutput.missingInfo}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
