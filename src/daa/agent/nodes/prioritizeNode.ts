/**
 * Cognitive Agent — Prioritize 节点（DeepSeek checkpoint）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { InvestigationTarget, ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import { buildPrioritizePrompt } from "@/src/daa/agent/cognitivePrompts";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { validateShape } from "@/src/daa/agent/helpers/validation";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { findSimilarThesis } from "@/src/daa/agent/store/thesisStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export async function prioritizeNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    if (!state.portfolio) {
      return { errors: ["prioritize: no portfolio data"] };
    }

    // 2B: 预加载 thesis 准确率，供 LLM 做优先级判断
    const thesisAccuracy = new Map<string, number>();
    for (const t of state.activeTheses.slice(0, 15)) {
      try {
        const avg = await thesisStore.getThesisAccuracyAvg(t.id);
        if (avg !== null) thesisAccuracy.set(t.id, avg);
      } catch (e) {
        logSwallowed("cognitiveGraph.prioritize.accuracy", e);
      }
    }

    const prompt = buildPrioritizePrompt({
      portfolio: state.portfolio,
      market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
      news: state.news ?? { items: [] },
      theses: state.activeTheses,
      thesisAccuracy,
    });

    const { data, tokensUsed } = await callDeepSeekJson<{
      targets: Array<{ threadId: string | null; reason: string; dataNeeded: string[] }>;
      newThreads: Array<{ title: string; initialThesis: string; assetKeys: string[]; tags: string[] }>;
    }>(prompt, "cognitiveGraph.prioritize", { tier: "fast" });

    if (!data) {
      return {
        errors: ["prioritize: DeepSeek 未返回有效 JSON"],
        totalTokens: tokensUsed,
      };
    }

    // P0-2: 校验 LLM 输出结构
    const valErrors = validateShape(data, { targets: "array" });
    if (valErrors.length > 0) {
      return {
        errors: valErrors.map(e => `prioritize.validation: ${e}`),
        totalTokens: tokensUsed,
      };
    }

    // 创建新 thesis（如果 LLM 建议），P2-9: 去重检查
    for (const nt of data.newThreads ?? []) {
      try {
        // 检查是否存在相似 thesis
        const existing = await findSimilarThesis(nt.assetKeys ?? [], nt.title);
        if (existing) {
          logSwallowed("cognitiveGraph.prioritize.dedup", new Error(`跳过重复 thesis: "${nt.title}" 已有类似 "${existing.title}"`));
          continue;
        }
        const created = await thesisStore.createResearchThread({
          title: nt.title,
          thesisText: nt.initialThesis,
          assetKeys: nt.assetKeys,
          tags: nt.tags,
          conviction: "uncertain",
          reviewAt: new Date(Date.now() + (state.agentConfig?.reviewIntervalDays ?? 14) * 86400000),
        });
        // 添加到调查队列
        data.targets.push({
          threadId: created.id,
          reason: "新创建的研究线索",
          dataNeeded: ["technical", "valuation"],
        });
      } catch (e) {
        logSwallowed("cognitiveGraph.prioritize.createThread", e);
      }
    }

    // 设置调查队列
    const maxTargets = state.agentConfig?.maxInvestigationTargets ?? 3;
    const targets: InvestigationTarget[] = (data.targets ?? []).slice(0, maxTargets);
    const first = targets[0] ?? null;
    let currentThread: ResearchThread | null = null;
    if (first?.threadId) {
      currentThread = await thesisStore.getThesisById(first.threadId);
    }

    // Phase 2: 加载匹配的调查策略（基于当前 regime + conviction + tags）
    let matchedStrategies: CognitiveUpdate["matchedStrategies"] = [];
    try {
      const { findMatchingStrategies } = await import("@/src/daa/agent/learning/strategyStore");
      const strategies = await findMatchingStrategies({
        regime: state.market?.regime ?? "unknown",
        conviction: first?.threadId ? (currentThread?.conviction ?? "uncertain") : "uncertain",
        tags: currentThread?.tags ?? [],
        assetKeys: currentThread?.assetKeys ?? [],
      });
      matchedStrategies = strategies.map(s => ({
        id: s.id,
        name: s.name,
        triggerConditions: s.triggerConditions,
        toolSequence: s.toolSequence,
        promptTemplate: s.promptTemplate,
        successRate: s.successRate,
      }));
    } catch (e) {
      logSwallowed("cognitiveGraph.prioritize.matchStrategies", e);
    }

    return {
      investigationQueue: targets,
      newThreadSuggestions: data.newThreads ?? [],
      currentTarget: first,
      currentThread,
      matchedStrategies,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "prioritize",
        threadId: null,
        input: `${state.activeTheses.length} theses, ${state.portfolio.holdings.length} holdings`,
        output: `${targets.length} targets, ${matchedStrategies.length} strategies matched`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
      toolsCalled: [{ tool: "prioritize", input: {}, outputSummary: `${targets.length} targets, ${matchedStrategies.length} strategies`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.prioritize", e);
    return { errors: [`prioritize: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
