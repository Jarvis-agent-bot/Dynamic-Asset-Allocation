import { createAssistantToolHandlers } from "./agentToolHandlers";
import type { DaaAgentToolContext, DaaAgentToolMeta } from "./agentToolTypes";
import { buildAssistantFallbackReply } from "./agentToolViewHandlers";

const ASSISTANT_TOOL_CATALOG: DaaAgentToolMeta[] = [
  { intent: "help", name: "show_help", description: "返回当前助手可支持的查询和模拟执行入口。" },
  { intent: "brain_status", name: "get_brain_status", description: "返回当前大脑可见能力、模型路由、认知链路与动作边界。" },
  { intent: "brain_set_mode", name: "set_brain_mode", description: "切换当前大脑模式到顾问、操作员或自动驾驶。" },
  { intent: "portfolio_status", name: "get_workbench_snapshot", description: "读取当前工作台的组合总览与核心持仓。" },
  { intent: "risk_status", name: "get_risk_status", description: "读取最近一次调仓或组合风控摘要。" },
  { intent: "market_status", name: "get_market_status", description: "读取市场环境与行情健康状态。" },
  { intent: "latest_cycle", name: "get_latest_cycle", description: "读取最近一轮调仓周期。" },
  { intent: "agent_run", name: "run_cognitive_cycle", description: "手动触发一轮 Cognitive Agent 调查循环。" },
  { intent: "agent_bootstrap", name: "bootstrap_theses", description: "基于当前持仓初始化研究论点。" },
  { intent: "rebalance_generate", name: "generate_rebalance_cycle", description: "生成一轮新的本地模拟调仓建议。" },
  { intent: "rebalance_execute", name: "execute_rebalance_sim", description: "执行最新一轮本地模拟调仓。" },
  { intent: "confirm_action", name: "confirm_pending_action", description: "确认并执行待确认动作。" },
  { intent: "cancel_action", name: "cancel_pending_action", description: "取消当前待确认动作。" },
  { intent: "trade", name: "execute_trade_sim", description: "预览或执行一笔本地模拟买卖。" },
  { intent: "thesis_status", name: "get_thesis_status", description: "查询 Cognitive Agent 的活跃研究论点状态。" },
  { intent: "agent_briefing", name: "get_agent_briefing", description: "查询最新 Agent 日报（意外发现、自动跟踪项、改观条件）。" },
  { intent: "llm_answer", name: "answer_with_llm", description: "用上下文、记忆和学习摘要生成自由问答回复。" },
  { intent: "unknown", name: "fallback_reply", description: "当无法稳定映射动作时，回退到问答或帮助信息。" },
];

function buildAssistantToolRegistry(input: DaaAgentToolContext) {
  const handlers = createAssistantToolHandlers(input);
  return new Map(
    ASSISTANT_TOOL_CATALOG.map((meta) => [meta.intent, {
      ...meta,
      execute: handlers.get(meta.intent),
    }]),
  );
}

export async function executeAssistantIntent(input: DaaAgentToolContext) {
  const registry = buildAssistantToolRegistry(input);
  const tool = registry.get(input.intent.kind) || registry.get("unknown");
  if (!tool?.execute) {
    return buildAssistantFallbackReply(input.currentPendingAction);
  }
  return tool.execute();
}
