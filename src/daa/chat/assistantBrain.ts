import "@/src/daa/agent/tools/index";

import { bootstrapTheses, ensureAssetThesisCoverage } from "@/src/daa/agent/bootstrap";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { getActiveTheses } from "@/src/daa/agent/store/thesisStore";
import { getRegisteredToolCount, getToolsByCategory } from "@/src/daa/agent/tools/registry";
import { buildBrainBoundaryText, buildBrainConfigForMode, describeBrainModeSummary, getBrainModeLabel, resolveBrainConfig } from "@/src/daa/brain/brainPolicy";
import type { DaaBrainMode } from "@/src/daa/config/systemConfig";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { getDaaSystemConfig, patchDaaSystemConfig } from "@/src/daa/store/daaStorePg";

import type { DaaAssistantRuntimeContext } from "./agentContext";

function formatLatestRunSummary(latestRun: Awaited<ReturnType<typeof getLatestRun>>): string {
  if (!latestRun) return "最近尚未运行投资复核。";
  return [
    `最近运行：${latestRun.status}`,
    `时间：${new Date(latestRun.createdAt).toLocaleString("zh-CN")}`,
    `Tokens：${latestRun.totalTokens}`,
    `复核变化：${latestRun.surprises.length}`,
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
    `当前授权：投资助理 / ${describeBrainModeSummary(runtimeContext.systemConfig)}。`,
    "通道权限：Web 对话和 Telegram 机器人共用同一套工具、上下文和投资助理授权矩阵；Telegram 额外需要 webhook secret 与 allowlist 通过。",
    `可见范围：组合 ${holdings} 个持仓，总权益 ${Number(totalEquity || 0).toFixed(2)} ${baseCurrency}；同时可读系统配置、LLM 路由、投资助理复核状态、活跃投资判断、会话摘要、复盘学习与简报摘要。`,
    `工具底座：共 ${totalTools} 个投资助理工具，其中 observe ${observeTools} / analyze ${analyzeTools} / meta ${metaTools} / act ${actTools}。`,
    `动作边界：${buildBrainBoundaryText(runtimeContext.systemConfig)}`,
    `复核状态：当前活跃投资判断 ${theses.length} 个。${formatLatestRunSummary(latestRun)}`,
    "当前模型与权限摘要：",
    runtimeContext.systemDigest,
  ].join("\n");
}

export async function runAssistantBootstrap(runtimeContext: DaaAssistantRuntimeContext): Promise<string> {
  const focusAssets = runtimeContext.readModel.bootstrap.assetUniverse
    .map((item) => ({ item, isHeld: isVisibleHolding(item) }))
    .filter(({ item, isHeld }) => isHeld || item.watchEnabled)
    .map(({ item, isHeld }) => ({
      assetKey: item.assetKey,
      symbol: item.symbol,
      holdingQty: isHeld ? Number(item.holdingQty) || 0 : 0,
      lastPrice: Number(item.lastPrice) || Number(item.holdingPrice) || 0,
      role: isHeld ? "holding" as const : "watchlist" as const,
      notes: item.notes,
      tags: isHeld ? item.holdingTags : item.watchTags,
    }));

  if (focusAssets.length === 0) {
    return "当前没有持仓或观察列表，无法建立初始投资判断。请先同步组合或添加观察资产后再执行。";
  }

  const existing = await getActiveTheses().catch(() => []);
  if (existing.length > 0) {
    const result = await ensureAssetThesisCoverage(focusAssets);
    return result.created > 0
      ? `已补齐研究覆盖，新增 ${result.created} 个投资判断。当前活跃投资判断 ${existing.length + result.created} 个。${result.errors.length > 0 ? `\n附带告警：${result.errors.slice(0, 3).join("；")}` : ""}`
      : `当前已有 ${existing.length} 个活跃投资判断，持仓和观察列表覆盖已齐备。`;
  }

  const result = await bootstrapTheses(focusAssets);
  return result.created > 0
    ? `已建立初始投资判断，新增 ${result.created} 个投资判断。${result.errors.length > 0 ? `\n附带告警：${result.errors.slice(0, 3).join("；")}` : ""}`
    : `本次未建立新的投资判断。${result.errors.length > 0 ? `\n原因：${result.errors.slice(0, 3).join("；")}` : ""}`;
}

export async function runAssistantCognitiveCycle(runtimeContext?: DaaAssistantRuntimeContext): Promise<string> {
  if (runtimeContext && resolveBrainConfig(runtimeContext.systemConfig.brain).mode === "autopilot") {
    const result = await runAutopilotLoop({
      source: "manual",
      reason: "assistant_chat_manual_autopilot",
    });
    return [
      "已手动触发一轮自动复核闭环。",
      result.skipped ? `状态：已跳过，原因：${result.reason || "未知"}` : `runId: ${result.cognitiveRun.runId || "-"}`,
      `目标权重池：${result.targetWeightPool.persistedCount > 0 ? `已写入 ${result.targetWeightPool.persistedCount} 个` : result.targetWeightPool.reason || "未写入"}`,
      `主动调仓：${result.rebalance.created ? `已生成周期 ${result.rebalance.cycleId}` : result.rebalance.reason || "未触发"}`,
      `模拟执行：${result.rebalance.autoExecute.executed ? `已执行 ${result.rebalance.autoExecute.ordersCount} 笔` : result.rebalance.autoExecute.blockedReason || result.rebalance.autoExecute.error || "未执行"}`,
      `Tokens：${result.cognitiveRun.totalTokens}`,
      `耗时：${result.cognitiveRun.durationMs}ms`,
      result.cognitiveRun.errors.length > 0 ? `错误：${result.cognitiveRun.errors.slice(0, 3).join("；")}` : "状态：执行完成。",
    ].join("\n");
  }

  const result = await runCognitiveAgentCycle("manual");
  return [
    "已手动触发一轮投资助理复核。",
    `runId: ${result.runId}`,
    `更新投资判断：${result.thesesUpdated}`,
    `复核变化：${result.surprises.length}`,
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
  const patches: Array<{ path: string; value: unknown }> = [
    { path: "/brain/mode", value: next.mode },
  ];
  if (next.mode === "autopilot") {
    patches.push(
      { path: "/cognitiveAgent/enabled", value: true },
      { path: "/policy/enabled", value: true },
      { path: "/policy/execution/autoGenerateEnabled", value: true },
      { path: "/policy/execution/autoExecuteEnabled", value: true },
    );
  } else if (
    current?.mode === next.mode
  ) {
    return `当前已经是「${getBrainModeLabel(next.mode)}」授权，无需切换。`;
  }

  try {
    const saved = await patchDaaSystemConfig({
      patches,
      baseVersion: input.runtimeContext.systemConfigVersion,
    });
    return [
      `已切换到「${getBrainModeLabel(saved.config.brain?.mode ?? next.mode)}」授权。`,
      `当前摘要：${describeBrainModeSummary(saved.config)}`,
      `动作边界：${buildBrainBoundaryText(saved.config)}`,
      "如需微调，可继续说：关闭自动复核 / 切到手动复核 / 查看投资助理状态。",
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
        `配置有并发变更，已基于最新版本重新切换到「${getBrainModeLabel(saved.config.brain?.mode ?? next.mode)}」授权。`,
        `当前摘要：${describeBrainModeSummary(saved.config)}`,
        `动作边界：${buildBrainBoundaryText(saved.config)}`,
      ].join("\n");
    }
    throw error;
  }
}
