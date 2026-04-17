/**
 * Strategy Learning — 类型定义
 *
 * 借鉴 Hermes Agent 的 Skill 系统：
 * - Hermes 的 Skill 是通用 Markdown 文件，自动从经验中生成
 * - DAA 的 Strategy 是投资调查策略模板，从高准确率 run 中提炼
 *
 * 策略模板不生成代码，而是生成"调查指导"：
 * - 什么条件下触发
 * - 推荐的工具组合
 * - 注入 investigate prompt 的策略提示
 */

// ── 调查策略模板 ──

export interface InvestigationStrategy {
  id: string;
  name: string;
  description: string;
  /** 触发条件表达式（如 "regime=risk_off AND conviction=uncertain"） */
  triggerConditions: string;
  /** 推荐工具调用顺序 */
  toolSequence: string[];
  /** 注入 investigate prompt 的策略提示文本 */
  promptTemplate: string;
  /** 产生此策略的 run ID 列表 */
  sourceRunIds: string[];
  /** 历史成功率（0-1） */
  successRate: number;
  /** 使用次数 */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── 策略匹配上下文 ──

export interface StrategyMatchContext {
  regime: string;
  conviction: string;
  tags: string[];
  assetKeys: string[];
}

// ── 策略提取输入 ──

export interface StrategyExtractionInput {
  runId: string;
  toolsCalled: Array<{ tool: string; input: Record<string, unknown>; outputSummary: string }>;
  thesesUpdated: number;
  surprises: number;
  regime: string;
  targetConvictions: string[];
}
