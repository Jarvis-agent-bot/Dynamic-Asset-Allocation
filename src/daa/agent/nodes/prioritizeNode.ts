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
        reasoningTraces: [{
          node: "prioritize",
          threadId: null,
          input: `${state.activeTheses.length} theses`,
          output: "LLM 未返回有效 JSON →review",
          tokensUsed,
          durationMs: Date.now() - t0,
        }],
      };
    }

    // P0-2: 校验 LLM 输出结构
    const valErrors = validateShape(data, { targets: "array" });
    if (valErrors.length > 0) {
      return {
        errors: valErrors.map(e => `prioritize.validation: ${e}`),
        totalTokens: tokensUsed,
        reasoningTraces: [{
          node: "prioritize",
          threadId: null,
          input: `${state.activeTheses.length} theses`,
          output: `validation failed (${valErrors.length} errors) →review`,
          tokensUsed,
          durationMs: Date.now() - t0,
        }],
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

    // 设置调查队列 — 先过滤掉 threadId 为 null/空的 target（LLM 偶尔会返回
    // "请求创建新 thesis"的占位 target，这些不能作为调查对象），防止下游条件
    // 分支因 currentThread=null 而跳过 investigate。
    const maxTargets = state.agentConfig?.maxInvestigationTargets ?? 3;
    const validTargets = (data.targets ?? []).filter(t => {
      const id = typeof t?.threadId === "string" ? t.threadId.trim() : "";
      return id.length > 0;
    });
    const targets: InvestigationTarget[] = validTargets.slice(0, maxTargets);

    // Starvation prevention: 保证 medium+ conviction thesis 在 staleness 窗口内被调查。
    // 修复之前的 bug：prioritize 偏向 uncertain 调查型 thesis，导致真正有 conviction
    // 的 medium thesis 永远不进调查队列，日报里"X天未调查"天数只涨不降。
    // 规则：至少预留 1 个槽位给超过阈值的 medium+ thesis（按 stale 天数倒序选最久的）。
    const stalenessDays = state.agentConfig?.thesisStalenessDays ?? 7;
    const stalenessCutoff = Date.now() - stalenessDays * 86400000;
    const targetIds = new Set(targets.map(t => t.threadId).filter(Boolean) as string[]);
    const staleDirectional = state.activeTheses
      .filter(t =>
        (t.conviction === "medium" || t.conviction === "high")
        && !targetIds.has(t.id)
        && Date.parse(t.updatedAt) < stalenessCutoff,
      )
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)); // 最旧优先

    if (staleDirectional.length > 0) {
      const inject: InvestigationTarget = {
        threadId: staleDirectional[0].id,
        reason: `starvation prevention: ${staleDirectional[0].conviction} conviction thesis 已 ${Math.floor((Date.now() - Date.parse(staleDirectional[0].updatedAt)) / 86400000)} 天未调查`,
        dataNeeded: ["technical", "news"],
      };
      // 挤掉 LLM 选中的最后一个 uncertain 槽位（若 maxTargets 已满），否则直接追加
      if (targets.length >= maxTargets) {
        const lastUncertainIdx = targets.findIndex(t => {
          const th = state.activeTheses.find(a => a.id === t.threadId);
          return th?.conviction === "uncertain";
        });
        if (lastUncertainIdx >= 0) {
          targets[lastUncertainIdx] = inject;
        } else {
          targets[targets.length - 1] = inject;
        }
      } else {
        targets.push(inject);
      }
    }

    // 选定第一个能加载到 thread 的 target —— 即使 threadId 合法，也可能
    // 因 DB 同步差异/归档等原因无法加载；此时自动降级到队列中下一个可用的 target，
    // 避免 currentThread=null 导致条件边跳过 investigate。
    let first: InvestigationTarget | null = null;
    let currentThread: ResearchThread | null = null;
    const skippedTargets: Array<{ threadId: string; reason: string }> = [];
    for (const candidate of targets) {
      if (!candidate?.threadId) continue;
      const loaded = await thesisStore.getThesisById(candidate.threadId);
      if (loaded) {
        first = candidate;
        currentThread = loaded;
        break;
      }
      skippedTargets.push({ threadId: candidate.threadId, reason: "getThesisById returned null" });
    }
    // 如果没有一个 target 能加载到 thread，降级到 review
    if (!first) {
      logSwallowed(
        "cognitiveGraph.prioritize.noLoadableTarget",
        new Error(`no loadable thread from ${targets.length} targets; skipped=${JSON.stringify(skippedTargets)}`),
      );
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

    const llmRawTargetCount = (data.targets ?? []).length;
    const filteredOut = llmRawTargetCount - validTargets.length;
    const routingSignal = first && currentThread ? "→investigate" : "→review(no loadable target)";

    return {
      investigationQueue: targets,
      newThreadSuggestions: data.newThreads ?? [],
      currentTarget: first,
      currentThread,
      matchedStrategies,
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "prioritize",
        threadId: first?.threadId ?? null,
        input: `${state.activeTheses.length} theses, ${state.portfolio.holdings.length} holdings`,
        output: `${targets.length} targets (LLM ${llmRawTargetCount}, filtered ${filteredOut}, skipped ${skippedTargets.length}), first=${first?.threadId ?? "none"}, thread=${currentThread ? "loaded" : "null"} ${routingSignal}`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
      toolsCalled: [{ tool: "prioritize", input: {}, outputSummary: `${targets.length} targets, ${matchedStrategies.length} strategies, ${routingSignal}`, durationMs: Date.now() - t0 }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.prioritize", e);
    return { errors: [`prioritize: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
