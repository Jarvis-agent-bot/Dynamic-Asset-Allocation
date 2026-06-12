/**
 * Context Engine — 类型定义
 *
 * 借鉴 Hermes Agent 的 ContextCompressor：
 * - 分层上下文管理（每层独立预算 + 优先级）
 * - 滑动窗口（最近 N 轮完整保留，更早轮次压缩）
 * - 语义标签包装（<memory-context> 等）
 */

// ── 上下文层名称 ──

export type ContextLayerName =
  | "system"        // 角色设定 + 输出格式
  | "thesis"        // 当前投资判断详情
  | "portfolio"     // 相关持仓
  | "memory"        // pgvector 检索的历史记忆
  | "trade_feedback" // 交易反馈依据
  | "tools"         // 可用工具列表
  | "strategy"      // 匹配的复核策略（Phase 2）
  | "tool_results"  // ReAct 循环中的工具结果
  | "rules"         // 操作规则 + 输出格式

// ── 上下文层 ──

export interface ContextLayer {
  name: ContextLayerName;
  content: string;
  /** 优先级 1-10，高优先级层不会被压缩（10 = 永不压缩） */
  priority: number;
  /** 最大 token 占比（0-1），超出部分会被截断或压缩 */
  maxTokenShare: number;
  /** 语义标签包装，如 "memory-context" → <memory-context>...</memory-context> */
  wrapTag?: string;
}

// ── 预算分配 ──

export interface TokenBudget {
  layerName: ContextLayerName;
  allocatedTokens: number;
  actualTokens: number;
  wasCompressed: boolean;
}

// ── 构建结果 ──

export interface ContextBuildResult {
  prompt: string;
  totalTokens: number;
  budgets: TokenBudget[];
  compressedLayers: ContextLayerName[];
}
