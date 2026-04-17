/**
 * Agent Tool System V2 — 类型定义
 *
 * 借鉴 Hermes Agent 的分类注册模式，将工具分为 4 个类别：
 * - observe: 只读查询（信号、指标、持仓）
 * - analyze: 计算分析（回测、相关性、模拟）
 * - act: 写入操作（创建论点、调整权重，需审批）
 * - meta: 自省反思（历史决策、准确率、论点轨迹）
 */

// ── 信号类型常量 ──

export const SIGNAL_TYPES = ["technical", "valuation", "news", "human"] as const;
export type SignalType = typeof SIGNAL_TYPES[number];

// ── 工具分类 ──

export type ToolCategory = "observe" | "analyze" | "act" | "meta";

// ── 参数定义 ──

export interface ToolParamDef {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}

// ── 工具定义 V2 ──

export interface ToolDefinitionV2 {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, ToolParamDef>;
  /** 声明输出字段名和类型，供 LLM 知道可引用 $tool_results.{name}.{field} */
  outputSchema?: Record<string, string>;
  /** act 类工具需要审批确认 */
  requiresApproval?: boolean;
  /** 语义标签，用于策略匹配 */
  tags?: string[];
}

// ── 执行结果 V2 ──

export interface ToolResultV2 {
  toolName: string;
  category: ToolCategory;
  success: boolean;
  data: unknown;
  /** 扁平化输出字段，供链式引用 $tool_results.{toolName}.{field} */
  outputFields: Record<string, unknown>;
  error?: string;
  latencyMs: number;
}

// ── 执行器接口 ──

/** 工具执行上下文 — 注入 state-dependent 数据 */
export interface ToolExecutionContext {
  market: import("@/src/daa/agent/cognitiveState").MarketSnapshot | null;
  portfolio: import("@/src/daa/agent/cognitiveState").PortfolioSnapshot | null;
}

export type ToolExecutorV2 = (
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
) => Promise<ToolResultV2>;

// ── 注册项 ──

export interface ToolEntryV2 {
  definition: ToolDefinitionV2;
  executor: ToolExecutorV2;
}
