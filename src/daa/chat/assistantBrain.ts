import "@/src/daa/agent/tools/index";

import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { getActiveTheses } from "@/src/daa/agent/store/thesisStore";
import { getRegisteredToolCount, getToolsByCategory } from "@/src/daa/agent/tools/registry";
import { buildBrainBoundaryText, buildBrainConfigForMode, describeBrainModeSummary, getBrainModeLabel } from "@/src/daa/brain/brainPolicy";
import type { DaaBrainMode } from "@/src/daa/config/systemConfig";
import { getDaaSystemConfig, patchDaaSystemConfig } from "@/src/daa/store/daaStorePg";

import type { DaaAssistantRuntimeContext } from "./agentContext";

function formatLatestRunSummary(latestRun: Awaited<ReturnType<typeof getLatestRun>>): string {
  if (!latestRun) return "最近尚未运行认知循环。";
  return [
    `最近运行：${latestRun.status}`,
    `时间：${new Date(latestRun.createdAt).toLocaleString("zh-CN")}`,
    `Tokens：${latestRun.totalTokens}`,
    `Surprises：${latestRun.surprises.length}`,
  ].join(" | ");
}

export async function buildAssistantBrainStatusText(runtimeContext: DaaAssistantRuntimeContext): Promise<string> {
  const [theses, latestRun] = await Promise.all([
    getActiveTheses().catch(() => []),
    getLatestRun().catch(() => null),
  ]);

  const observeTools = getToolsByCategory("observe").length;
  const analyzeTools = getToolsByCategory("analyze").length;
  const metaTools = getToolsByCategory("meta").length;
  const actTools = getToolsByCategory("act").length;
  const totalTools = getRegisteredToolCount();
  const holdings = runtimeContext.readModel.allocationSummary.holdingCount;
  const totalEquity = runtimeContext.readModel.allocationSummary.totalEquity;
  const baseCurrency = runtimeContext.readModel.bootstrap.baseCurrency;

  return [
    `当前模式：全权大脑 / ${describeBrainModeSummary(runtimeContext.systemConfig)}。`,
    `可见范围：组合 ${holdings} 个持仓，总权益 ${Number(totalEquity || 0).toFixed(2)} ${baseCurrency}；同时可读系统配置、LLM 路由、认知 Agent 状态、会话记忆与日报摘要。`,
    `工具底座：共 ${totalTools} 个 Agent 工具，其中 observe ${observeTools} / analyze ${analyzeTools} / meta ${metaTools} / act ${actTools}。`,
    `动作边界：${buildBrainBoundaryText(runtimeContext.systemConfig)}`,
    `认知状态：当前活跃论点 ${theses.length} 个。${formatLatestRunSummary(latestRun)}`,
    "当前模型与权限摘要：",
    runtimeContext.systemDigest,
  ].join("\n");
}

export async function runAssistantBootstrap(runtimeContext: DaaAssistantRuntimeContext): Promise<string> {
  const holdings = runtimeContext.readModel.bootstrap.assetUniverse
    .filter((item) => Number(item.holdingQty) > 0)
    .map((item) => ({
      assetKey: item.assetKey,
      symbol: item.symbol,
      holdingQty: Number(item.holdingQty) || 0,
      lastPrice: Number(item.lastPrice) || 0,
    }));

  if (holdings.length === 0) {
    return "当前没有持仓，无法初始化论点。请先同步组合或建立持仓后再执行。";
  }

  const existing = await getActiveTheses().catch(() => []);
  if (existing.length > 0) {
    return `当前已经存在 ${existing.length} 个活跃论点，暂不重复初始化。如需重建，建议先归档旧论点后再执行。`;
  }

  const result = await bootstrapTheses(holdings);
  return result.created > 0
    ? `已完成论点初始化，新增 ${result.created} 个研究论点。${result.errors.length > 0 ? `\n附带告警：${result.errors.slice(0, 3).join("；")}` : ""}`
    : `初始化未产生新论点。${result.errors.length > 0 ? `\n原因：${result.errors.slice(0, 3).join("；")}` : ""}`;
}

export async function runAssistantCognitiveCycle(): Promise<string> {
  const result = await runCognitiveAgentCycle("manual");
  return [
    "已手动触发一轮 Cognitive Agent 调查。",
    `runId: ${result.runId}`,
    `更新论点：${result.thesesUpdated}`,
    `Surprises：${result.surprises.length}`,
    `Tokens：${result.totalTokens}`,
    `耗时：${result.durationMs}ms`,
    result.errors.length > 0 ? `错误：${result.errors.slice(0, 3).join("；")}` : "状态：执行完成。",
  ].join("\n");
}

export async function switchAssistantBrainMode(input: {
  runtimeContext: DaaAssistantRuntimeContext;
  mode: DaaBrainMode;
}): Promise<string> {
  const current = input.runtimeContext.systemConfig.brain;
  const next = buildBrainConfigForMode(input.mode, current);
  if (
    current?.mode === next.mode
    && current?.allowConfigPatch === next.allowConfigPatch
    && current?.autoApplyLowRiskPatch === next.autoApplyLowRiskPatch
  ) {
    return `当前已经是${getBrainModeLabel(next.mode)}模式，无需切换。`;
  }

  const patches = [
    { path: "/brain/mode", value: next.mode },
    { path: "/brain/allowConfigPatch", value: next.allowConfigPatch },
    { path: "/brain/autoApplyLowRiskPatch", value: next.autoApplyLowRiskPatch },
  ];

  try {
    const saved = await patchDaaSystemConfig({
      patches,
      baseVersion: input.runtimeContext.systemConfigVersion,
    });
    return [
      `已切换到${getBrainModeLabel(saved.config.brain?.mode ?? next.mode)}模式。`,
      `当前摘要：${describeBrainModeSummary(saved.config)}`,
      `动作边界：${buildBrainBoundaryText(saved.config)}`,
      "如需微调，可继续说：关闭自动驾驶 / 切到操作员模式 / 查看大脑状态。",
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message.startsWith("system_config_version_conflict:")) {
      const latest = await getDaaSystemConfig();
      const saved = await patchDaaSystemConfig({
        patches,
        baseVersion: latest.version,
      });
      return [
        `配置有并发变更，已基于最新版本重新切换到${getBrainModeLabel(saved.config.brain?.mode ?? next.mode)}模式。`,
        `当前摘要：${describeBrainModeSummary(saved.config)}`,
        `动作边界：${buildBrainBoundaryText(saved.config)}`,
      ].join("\n");
    }
    throw error;
  }
}
