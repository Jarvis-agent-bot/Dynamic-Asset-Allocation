import "@/src/daa/agent/tools/index";

import { bootstrapTheses } from "@/src/daa/agent/bootstrap";
import { runCognitiveAgentCycle } from "@/src/daa/agent/cognitiveGraph";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { getActiveTheses } from "@/src/daa/agent/store/thesisStore";
import { getRegisteredToolCount, getToolsByCategory } from "@/src/daa/agent/tools/registry";

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
    "当前模式：全权大脑（受策略门禁，不是无条件裸执行）。",
    `可见范围：组合 ${holdings} 个持仓，总权益 ${Number(totalEquity || 0).toFixed(2)} ${baseCurrency}；同时可读系统配置、LLM 路由、认知 Agent 状态、会话记忆与日报摘要。`,
    `工具底座：共 ${totalTools} 个 Agent 工具，其中 observe ${observeTools} / analyze ${analyzeTools} / meta ${metaTools} / act ${actTools}。`,
    "动作边界：可直接启动认知循环、初始化论点、生成调仓建议；模拟交易与模拟调仓执行仍保留确认门禁；真实交易、密钥明文、系统配置直改仍未放开。",
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
