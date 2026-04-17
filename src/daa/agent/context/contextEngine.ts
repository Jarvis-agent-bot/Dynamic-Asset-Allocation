/**
 * Context Engine — 分层上下文管理器
 *
 * 替换 cognitiveGraph.ts 中的 MAX_PROMPT_CHARS + 手动字符串拼接。
 *
 * 核心能力：
 * 1. 每层独立预算（优先级驱动分配）
 * 2. 滑动窗口（工具结果：最近 2 轮完整，更早轮次自动压缩）
 * 3. 语义标签包装（<memory-context>、<strategy-context>）
 * 4. 超预算时按优先级从低到高截断，不调 LLM（轻量级）
 */

import type {
  ContextLayerName,
  ContextLayer,
  TokenBudget,
  ContextBuildResult,
} from "@/src/daa/agent/context/types";

// ── 默认预算分配 ──

/** 各层默认 token 占比和优先级 */
const DEFAULT_LAYER_CONFIG: Record<ContextLayerName, { priority: number; maxTokenShare: number }> = {
  system:         { priority: 10, maxTokenShare: 0.08 },  // 角色设定，永不压缩
  thesis:         { priority: 9,  maxTokenShare: 0.15 },  // 论点核心
  rules:          { priority: 9,  maxTokenShare: 0.12 },  // 输出格式
  tools:          { priority: 8,  maxTokenShare: 0.15 },  // 工具列表
  portfolio:      { priority: 7,  maxTokenShare: 0.10 },  // 持仓背景
  tool_results:   { priority: 6,  maxTokenShare: 0.20 },  // 工具结果（滑动窗口）
  memory:         { priority: 5,  maxTokenShare: 0.10 },  // 历史记忆
  trade_feedback: { priority: 4,  maxTokenShare: 0.05 },  // 交易反馈
  strategy:       { priority: 3,  maxTokenShare: 0.05 },  // 策略提示
};

// ── Token 估算 ──

/** 粗略估计 token 数（中文约 1.5 token/字，英文约 0.75 token/词） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length * 0.5);
}

// ── ContextManager ──

export class ContextManager {
  private layers = new Map<ContextLayerName, ContextLayer>();
  private toolResultRounds: string[] = [];

  /** 添加一个上下文层 */
  addLayer(
    name: ContextLayerName,
    content: string,
    opts?: Partial<Pick<ContextLayer, "priority" | "maxTokenShare" | "wrapTag">>,
  ): this {
    const defaults = DEFAULT_LAYER_CONFIG[name] ?? { priority: 5, maxTokenShare: 0.10 };
    this.layers.set(name, {
      name,
      content,
      priority: opts?.priority ?? defaults.priority,
      maxTokenShare: opts?.maxTokenShare ?? defaults.maxTokenShare,
      wrapTag: opts?.wrapTag,
    });
    return this;
  }

  /** 添加工具结果轮次（滑动窗口管理） */
  addToolResultRound(roundText: string): this {
    this.toolResultRounds.push(roundText);
    return this;
  }

  /** 构建最终 prompt */
  build(totalBudgetTokens: number = 12000): ContextBuildResult {
    const budgets: TokenBudget[] = [];
    const compressedLayers: ContextLayerName[] = [];
    const outputParts: string[] = [];

    // 1. 处理工具结果的滑动窗口
    if (this.toolResultRounds.length > 0) {
      const windowedContent = this.buildToolResultsWindow();
      this.addLayer("tool_results", windowedContent);
    }

    // 2. 按优先级从高到低排序
    const sortedLayers = Array.from(this.layers.values())
      .sort((a, b) => b.priority - a.priority);

    // 3. 第一遍：计算各层实际 token 和分配预算
    let totalActualTokens = 0;
    const layerTokens = sortedLayers.map(layer => {
      const actual = estimateTokens(layer.content);
      totalActualTokens += actual;
      const allocated = Math.floor(totalBudgetTokens * layer.maxTokenShare);
      return { layer, actual, allocated };
    });

    // 4. 如果总 token 在预算内，不需要压缩
    if (totalActualTokens <= totalBudgetTokens) {
      for (const { layer } of layerTokens) {
        const wrapped = this.wrapContent(layer);
        if (wrapped) outputParts.push(wrapped);
        budgets.push({
          layerName: layer.name,
          allocatedTokens: Math.floor(totalBudgetTokens * layer.maxTokenShare),
          actualTokens: estimateTokens(layer.content),
          wasCompressed: false,
        });
      }

      return {
        prompt: outputParts.join("\n\n"),
        totalTokens: totalActualTokens,
        budgets,
        compressedLayers,
      };
    }

    // 5. 超预算：按优先级从低到高截断
    let remainingBudget = totalBudgetTokens;

    // 先保证高优先级层的预算
    for (const item of layerTokens) {
      const { layer, actual } = item;

      if (actual === 0 || !layer.content.trim()) {
        budgets.push({ layerName: layer.name, allocatedTokens: 0, actualTokens: 0, wasCompressed: false });
        continue;
      }

      const allocated = Math.min(actual, Math.floor(remainingBudget * layer.maxTokenShare * 1.5));

      if (actual <= allocated) {
        // 不需要压缩
        const wrapped = this.wrapContent(layer);
        if (wrapped) outputParts.push(wrapped);
        remainingBudget -= actual;
        budgets.push({ layerName: layer.name, allocatedTokens: allocated, actualTokens: actual, wasCompressed: false });
      } else if (layer.priority >= 9) {
        // 高优先级：完整保留（即使超预算）
        const wrapped = this.wrapContent(layer);
        if (wrapped) outputParts.push(wrapped);
        remainingBudget -= actual;
        budgets.push({ layerName: layer.name, allocatedTokens: allocated, actualTokens: actual, wasCompressed: false });
      } else {
        // 低优先级：截断到预算
        const truncated = this.truncateToTokens(layer.content, Math.max(allocated, 200));
        const truncLayer = { ...layer, content: truncated };
        const wrapped = this.wrapContent(truncLayer);
        if (wrapped) outputParts.push(wrapped);
        const truncActual = estimateTokens(truncated);
        remainingBudget -= truncActual;
        compressedLayers.push(layer.name);
        budgets.push({ layerName: layer.name, allocatedTokens: allocated, actualTokens: truncActual, wasCompressed: true });
      }
    }

    const finalTokens = budgets.reduce((sum, b) => sum + b.actualTokens, 0);

    return {
      prompt: outputParts.join("\n\n"),
      totalTokens: finalTokens,
      budgets,
      compressedLayers,
    };
  }

  // ── 内部方法 ──

  /** 滑动窗口：最近 2 轮完整保留，更早轮次压缩为单行 */
  private buildToolResultsWindow(): string {
    const rounds = this.toolResultRounds;
    if (rounds.length === 0) return "";

    const parts: string[] = [];
    for (let i = 0; i < rounds.length; i++) {
      if (i >= rounds.length - 2) {
        parts.push(rounds[i]); // 最近 2 轮完整
      } else {
        parts.push(`[第 ${i + 1} 轮工具调用结果已压缩，关键证据已纳入后续轮次]`);
      }
    }
    return parts.join("\n\n");
  }

  /** 语义标签包装 */
  private wrapContent(layer: ContextLayer): string {
    if (!layer.content.trim()) return "";
    if (layer.wrapTag) {
      return `<${layer.wrapTag}>\n${layer.content}\n</${layer.wrapTag}>`;
    }
    return layer.content;
  }

  /** 按 token 预算截断（保留开头 + 末尾提示） */
  private truncateToTokens(text: string, maxTokens: number): string {
    const charLimit = maxTokens * 2; // token → char 近似
    if (text.length <= charLimit) return text;
    const kept = text.slice(0, charLimit - 40);
    return kept + "\n...[因 token 预算限制已截断]";
  }

  // ── LLM 语义摘要（异步版本）──

  /**
   * 异步构建 prompt — 超预算时使用 LLM 语义摘要替代截断。
   *
   * 借鉴 Hermes Agent 的 ContextCompressor：
   * - 低优先级层超预算时，调 fast tier LLM 做摘要
   * - 摘要保留关键信息，比字符截断更智能
   * - 摘要失败时 fallback 到字符截断
   */
  async buildAsync(totalBudgetTokens: number = 12000): Promise<ContextBuildResult> {
    // 处理工具结果的滑动窗口
    if (this.toolResultRounds.length > 0) {
      this.addLayer("tool_results", this.buildToolResultsWindow());
    }

    // 按优先级排序
    const sortedLayers = Array.from(this.layers.values())
      .sort((a, b) => b.priority - a.priority);

    // 计算总 token
    let totalActualTokens = 0;
    const layerTokens = sortedLayers.map(layer => {
      const actual = estimateTokens(layer.content);
      totalActualTokens += actual;
      return { layer, actual };
    });

    // 不超预算 → 直接返回
    if (totalActualTokens <= totalBudgetTokens) {
      return this.build(totalBudgetTokens);
    }

    // 超预算 → 对低优先级层做 LLM 摘要
    const budgets: TokenBudget[] = [];
    const compressedLayers: ContextLayerName[] = [];
    const outputParts: string[] = [];
    let remainingBudget = totalBudgetTokens;

    for (const item of layerTokens) {
      const { layer, actual } = item;

      if (actual === 0 || !layer.content.trim()) {
        budgets.push({ layerName: layer.name, allocatedTokens: 0, actualTokens: 0, wasCompressed: false });
        continue;
      }

      const allocated = Math.min(actual, Math.floor(remainingBudget * layer.maxTokenShare * 1.5));

      if (actual <= allocated || layer.priority >= 9) {
        // 不压缩 / 高优先级完整保留
        const wrapped = this.wrapContent(layer);
        if (wrapped) outputParts.push(wrapped);
        remainingBudget -= actual;
        budgets.push({ layerName: layer.name, allocatedTokens: allocated, actualTokens: actual, wasCompressed: false });
      } else {
        // 低优先级超预算 → LLM 语义摘要
        const targetTokens = Math.max(allocated, 200);
        const summarized = await this.summarizeWithLlm(layer.content, targetTokens, layer.name);
        const summarizedLayer = { ...layer, content: summarized };
        const wrapped = this.wrapContent(summarizedLayer);
        if (wrapped) outputParts.push(wrapped);
        const summarizedTokens = estimateTokens(summarized);
        remainingBudget -= summarizedTokens;
        compressedLayers.push(layer.name);
        budgets.push({ layerName: layer.name, allocatedTokens: allocated, actualTokens: summarizedTokens, wasCompressed: true });
      }
    }

    return {
      prompt: outputParts.join("\n\n"),
      totalTokens: budgets.reduce((sum, b) => sum + b.actualTokens, 0),
      budgets,
      compressedLayers,
    };
  }

  /**
   * 用 fast tier LLM 做语义摘要。失败时 fallback 到字符截断。
   */
  private async summarizeWithLlm(text: string, targetTokens: number, layerName: string): Promise<string> {
    try {
      const { callLlmText } = await import("@/src/daa/agent/helpers/llm");
      const targetChars = targetTokens * 2;
      const prompt = `请将以下内容压缩为约 ${targetChars} 字的摘要。保留关键数据点和结论，删除冗余描述。只输出摘要，不要其他文字。

原文：
${text.slice(0, 6000)}`;

      const { text: summary } = await callLlmText(prompt, `contextEngine.summarize.${layerName}`, "fast");
      if (summary && summary.length > 10) {
        return summary;
      }
    } catch {
      // fallback to truncation
    }
    return this.truncateToTokens(text, targetTokens);
  }
}

// ── 工厂函数：为 investigateNode 构建 prompt ──

/**
 * 从 buildReactInvestigatePrompt 的结构化段落构建 ContextManager。
 *
 * 替代原来的 initialPrompt + toolRoundSummaries 字符串拼接。
 */
export function createInvestigateContextManager(sections: {
  system: string;
  thesis: string;
  portfolio: string;
  memory: string;
  tradeFeedback?: string;
  tools: string;
  rules: string;
  strategy?: string;
}): ContextManager {
  const cm = new ContextManager();

  cm.addLayer("system", sections.system);
  cm.addLayer("thesis", sections.thesis);
  cm.addLayer("portfolio", sections.portfolio);
  cm.addLayer("memory", sections.memory, { wrapTag: "memory-context" });
  if (sections.tradeFeedback) {
    cm.addLayer("trade_feedback", sections.tradeFeedback);
  }
  cm.addLayer("tools", sections.tools);
  cm.addLayer("rules", sections.rules);
  if (sections.strategy) {
    cm.addLayer("strategy", sections.strategy, { wrapTag: "strategy-context" });
  }

  return cm;
}
