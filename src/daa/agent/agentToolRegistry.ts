/**
 * Agent Tool Registry — 通用 Tool 抽象接口。
 *
 * 供 Cognitive Agent 的 prompt 参考，定义可请求的信号类型。
 *
 * ## Phase 3 已实现（LLM-driven Tool Calling）
 *
 * 当前状态：Phase 3 — ReAct 模式。
 * - 6 个工具定义 + executor 实现（见 agentToolExecutors.ts）
 * - investigateNode 使用 ReAct 循环（LLM → tool_calls → execute → observe → 继续推理）
 * - 每轮最多调用 3 个工具，总计最多 5 轮（可配置 agentConfig.maxReactRounds）
 * - 单工具执行超时 30s
 */

// ─── Tool Definition（描述型，不含执行逻辑）────────────────────────

export type AgentToolParamDef = {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
};

/** 通用 Agent Tool 定义 */
export type AgentToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, AgentToolParamDef>;
};

/** Tool 执行结果（Phase 3 ReAct Agent 使用） */
export type AgentToolResult = {
  toolName: string;
  success: boolean;
  data: unknown;
  error?: string;
  latencyMs?: number;
};

/** Tool 执行器接口（Phase 3 实现） */
export type AgentToolExecutor = (
  params: Record<string, unknown>,
) => Promise<AgentToolResult>;

/** Tool 注册项 = 定义 + 可选执行器 */
export type AgentToolEntry = {
  definition: AgentToolDefinition;
  /** Phase 3 实现：实际执行函数 */
  executor?: AgentToolExecutor;
};

// ─── 信号类型常量 ─────────────────────────────────────────────

export const SIGNAL_TYPES = ["technical", "valuation", "news", "human"] as const;
export type SignalType = typeof SIGNAL_TYPES[number];

// ─── 内置 Tool 定义 ──────────────────────────────────────────

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: "fetch_technical_signal",
    description: "获取指定资产的技术信号（SMA/RSI/MACD/波动率/动量等）。适合判断趋势强度和短期方向。",
    parameters: {
      symbol: { type: "string", description: "资产代码（如 AAPL, 0700.HK）", required: true },
    },
  },
  {
    name: "fetch_valuation_signal",
    description: "获取指定资产的估值信号（PE/PB/股息率/价格百分位/Z-score）。适合判断是否被低估或高估。",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
  },
  {
    name: "fetch_news_signal",
    description: "获取指定资产的新闻信号（LLM 情感分析/重大事件/行动建议/利好利空因素）。适合判断市场情绪和事件驱动。",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
  },
  {
    name: "fetch_human_signal",
    description: "获取指定资产的人因信号（基金经理持仓变动/立场/质量评分/信念强度）。适合判断机构动向。",
    parameters: {
      symbol: { type: "string", description: "资产代码", required: true },
    },
  },
  {
    name: "query_market_regime",
    description: "查询当前市场环境（regime/VIX/各区域风险评分/宏观周期阶段）。无需参数。",
    parameters: {},
  },
  {
    name: "query_portfolio_concentration",
    description: "查询当前组合集中度（HHI/最大仓位占比/各资产权重分布）。无需参数。",
    parameters: {},
  },
];

/** 将 tool 定义格式化为 LLM prompt 可读文本 */
export function formatToolDefinitionsForPrompt(tools: AgentToolDefinition[]): string {
  return tools.map((t) => {
    const params = Object.entries(t.parameters);
    const paramStr = params.length > 0
      ? ` 参数: ${params.map(([k, v]) => `${k}(${v.type}${v.required ? ",必填" : ""})`).join(", ")}`
      : " 无参数";
    return `- ${t.name}: ${t.description}${paramStr}`;
  }).join("\n");
}
