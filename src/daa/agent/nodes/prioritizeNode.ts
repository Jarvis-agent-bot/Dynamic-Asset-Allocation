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

const DEFAULT_MAX_INVESTIGATION_TARGETS = 5;

type RawInvestigationTarget = {
  threadId: string | null;
  reason?: string;
  dataNeeded?: string[];
};

type QueuedInvestigationTarget = {
  target: InvestigationTarget;
  priority: number;
  source: "llm" | "rotation";
  order: number;
};

function normalizeThreadId(raw: string | null | undefined, theses: ResearchThread[]): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.replace(/^[\["']+|[\]"']+$/g, ""),
    trimmed.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){0,3}(?:-[0-9a-f]{12})?/i)?.[0] ?? "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exact = theses.find(t => t.id === candidate);
    if (exact) return exact.id;
  }

  for (const candidate of candidates) {
    if (candidate.length < 8) continue;
    const matches = theses.filter(t => t.id.startsWith(candidate));
    if (matches.length === 1) return matches[0].id;
  }

  return null;
}

function normalizeDataNeeded(value: unknown): string[] {
  if (!Array.isArray(value)) return ["news", "technical"];
  return value
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function addQueuedTarget(
  byThreadId: Map<string, QueuedInvestigationTarget>,
  item: QueuedInvestigationTarget,
) {
  const id = item.target.threadId;
  if (!id) return;
  const prev = byThreadId.get(id);
  if (
    !prev
    || item.priority > prev.priority
    || (item.priority === prev.priority && item.order < prev.order)
  ) {
    byThreadId.set(id, item);
  }
}

function assetKeyMatchesFocus(assetKey: string, focusSymbols: Set<string>): boolean {
  if (focusSymbols.size === 0) return false;
  const normalized = String(assetKey || "").trim().toUpperCase();
  if (!normalized) return false;
  const symbol = normalized.includes("::") ? normalized.split("::").pop()! : normalized;
  return focusSymbols.has(symbol);
}

function buildRotationTargets(state: CognitiveState, stalenessDays: number, focusSymbols: Set<string>): QueuedInvestigationTarget[] {
  const now = Date.now();
  const holdingWeights = new Map<string, number>();
  for (const h of state.portfolio?.holdings ?? []) {
    holdingWeights.set(h.assetKey, Math.max(holdingWeights.get(h.assetKey) ?? 0, h.weightPct ?? 0));
  }
  const watchlistKeys = new Set((state.watchlist?.candidates ?? []).map(c => c.assetKey));

  return state.activeTheses
    .map((t, order): QueuedInvestigationTarget | null => {
      const updatedAt = Date.parse(t.updatedAt);
      const days = Number.isFinite(updatedAt) ? Math.floor((now - updatedAt) / 86400000) : stalenessDays + 1;
      const maxHoldingWeight = Math.max(0, ...t.assetKeys.map(k => holdingWeights.get(k) ?? 0));
      const inWatchlist = t.assetKeys.some(k => watchlistKeys.has(k));
      const reviewDue = t.reviewAt ? Date.parse(t.reviewAt) <= now : false;
      const stale = days >= stalenessDays;
      const focusEvent = t.assetKeys.some(k => assetKeyMatchesFocus(k, focusSymbols));
      const staleDirectional = (t.conviction === "medium" || t.conviction === "high") && stale;
      const uncertainHolding = t.conviction === "uncertain" && maxHoldingWeight > 0;
      const staleHighWeightHolding = maxHoldingWeight > 0.05 && stale;
      const watchlistNeedsReview = inWatchlist && (t.conviction === "uncertain" || stale);

      let priority = 0;
      let reason = "";
      if (focusEvent) {
        priority = 1100 + days;
        reason = `事件触发复核：相关资产出现在本轮新闻/外部事件中，距离上次有效调查 ${days} 天`;
      } else if (uncertainHolding) {
        priority = 1000 + days;
        reason = `轮询复核：持仓论点仍为观察态，权重 ${(maxHoldingWeight * 100).toFixed(1)}%，已 ${days} 天未有效调查`;
      } else if (staleHighWeightHolding) {
        priority = 950 + days;
        reason = `轮询复核：高权重持仓论点已 ${days} 天未有效调查，权重 ${(maxHoldingWeight * 100).toFixed(1)}%`;
      } else if (reviewDue) {
        priority = 900 + days;
        reason = `轮询复核：论点已到 reviewAt，距离上次有效调查 ${days} 天`;
      } else if (staleDirectional) {
        priority = 850 + days;
        reason = `轮询复核：${t.conviction} conviction 论点已 ${days} 天未有效调查`;
      } else if (watchlistNeedsReview) {
        priority = 800 + days;
        reason = `轮询复核：观察列表相关论点需要刷新，距离上次有效调查 ${days} 天`;
      }

      if (priority <= 0) return null;
      return {
        target: {
          threadId: t.id,
          reason,
          dataNeeded: ["news", "technical"],
        },
        priority,
        source: "rotation",
        order,
      };
    })
    .filter((v): v is QueuedInvestigationTarget => Boolean(v))
    .sort((a, b) => b.priority - a.priority || a.order - b.order);
}

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

    const maxTargets = state.agentConfig?.maxInvestigationTargets ?? DEFAULT_MAX_INVESTIGATION_TARGETS;
    const stalenessDays = state.agentConfig?.thesisStalenessDays ?? 7;
    const focusSymbols = new Set((state.focusSymbols ?? [])
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean));

    const prompt = buildPrioritizePrompt({
      portfolio: state.portfolio,
      watchlist: state.watchlist?.candidates ?? [],
      market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
      news: state.news ?? { items: [] },
      newsIntelligence: state.newsIntelligence ?? null,
      theses: state.activeTheses,
      thesisAccuracy,
      focusSymbols: [...focusSymbols],
      maxTargets,
    });

    const { data, tokensUsed } = await callDeepSeekJson<{
      targets: RawInvestigationTarget[];
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

    // 设置调查队列：LLM 给方向，代码做 id 归一、去重和轮询补位。
    // 这样即使模型返回短 id，或遗漏长期未调查的持仓/观察列表论点，本轮仍能落到可加载 thesis。
    const queuedByThreadId = new Map<string, QueuedInvestigationTarget>();
    const rawTargets = data.targets ?? [];
    let normalizedLlmTargets = 0;
    rawTargets.forEach((t, order) => {
      const id = normalizeThreadId(t?.threadId, state.activeTheses);
      if (!id) return;
      normalizedLlmTargets++;
      addQueuedTarget(queuedByThreadId, {
        target: {
          threadId: id,
          reason: typeof t.reason === "string" && t.reason.trim() ? t.reason.trim() : "LLM 选中的调查目标",
          dataNeeded: normalizeDataNeeded(t.dataNeeded),
        },
        priority: 700 - order,
        source: "llm",
        order,
      });
    });

    for (const item of buildRotationTargets(state, stalenessDays, focusSymbols)) {
      addQueuedTarget(queuedByThreadId, item);
    }

    const candidates = Array.from(queuedByThreadId.values())
      .sort((a, b) => b.priority - a.priority || a.order - b.order);

    const targets: InvestigationTarget[] = [];
    let first: InvestigationTarget | null = null;
    let currentThread: ResearchThread | null = null;
    const skippedTargets: Array<{ threadId: string; reason: string }> = [];
    for (const candidate of candidates) {
      if (targets.length >= maxTargets) break;
      const id = candidate.target.threadId;
      if (!id) continue;
      const loaded = await thesisStore.getThesisById(id);
      if (!loaded) {
        skippedTargets.push({ threadId: id, reason: "getThesisById returned null" });
        continue;
      }
      targets.push(candidate.target);
      if (!first) {
        first = candidate.target;
        currentThread = loaded;
      }
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

    const llmRawTargetCount = rawTargets.length;
    const filteredOut = llmRawTargetCount - normalizedLlmTargets;
    const rotationCount = targets.filter(t => {
      const queued = t.threadId ? queuedByThreadId.get(t.threadId) : null;
      return queued?.source === "rotation";
    }).length;
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
        output: `${targets.length} targets (LLM ${llmRawTargetCount}, normalized ${normalizedLlmTargets}, rotation ${rotationCount}, filtered ${filteredOut}, skipped ${skippedTargets.length}), first=${first?.threadId ?? "none"}, thread=${currentThread ? "loaded" : "null"} ${routingSignal}`,
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
