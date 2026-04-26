/**
 * Cognitive Agent — Surface 节点（生成 DailyBriefing + 可选 TG 推送）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { DailyBriefing, ThesisFailureImpact, ThesisConflict, AgentConfigOverlay, CognitionGap, MindChangeCondition, Surprise } from "@/src/daa/agent/cognitiveTypes";
import { buildSurfacePrompt, buildStrategyAdvisorPrompt, formatBriefingForTelegram } from "@/src/daa/agent/cognitivePrompts";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { validateShape, shouldCircuitBreak } from "@/src/daa/agent/helpers/validation";
import { DEEPSEEK_AVG_COST_PER_TOKEN } from "@/src/daa/agent/helpers/constants";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { getLatestRun } from "@/src/daa/agent/store/agentRunStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { shouldSendAgentBriefingTelegram } from "@/src/daa/automation/automationGuards";

/**
 * 代码直出“自动跟踪清单”（原 cognitionGaps）。
 *
 * 原来这里交给 LLM 做 "结构化清单 → JSON → 改写成自然语言 → JSON" 的来回翻译，
 * 既浪费 token 又容易产生幻觉（LLM 会胡编权重值、调查天数）。本函数是确定性的：
 *
 * - 触发条件（二选一）：
 *   (1) thesis conviction=uncertain 且仍有持仓（必须尽快给出明确判断）
 *   (2) 持仓权重 > 5% 且 thesis 超过 7 天未更新（高权重陈旧观点）
 * - 同 assetKey 多 thesis 去重，取最陈旧的一条
 * - triggerReason / focusHint 字段直接用 thesis 数据拼接，不再让 LLM 改写
 */
function computeDueForReview(
  theses: ResearchThread[],
  portfolio: { holdings: Array<{ assetKey: string; weightPct: number }> },
): CognitionGap[] {
  const candidates: CognitionGap[] = [];
  for (const t of theses) {
    const days = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
    for (const assetKey of t.assetKeys) {
      const holding = portfolio.holdings.find(h => h.assetKey === assetKey);
      const weight = holding?.weightPct ?? 0;
      const uncertainMatch = t.conviction === "uncertain" && weight > 0;
      const staleMatch = weight > 0.05 && days > 7;
      if (!uncertainMatch && !staleMatch) continue;

      const triggerReason = uncertainMatch
        ? `论点判断仍未收敛（conviction=uncertain，权重 ${(weight * 100).toFixed(1)}%）`
        : `持仓权重 ${(weight * 100).toFixed(1)}%，已 ${days} 天未得到新调查`;
      const focusHint = t.invalidationConditions
        ? `核对失效条件：${t.invalidationConditions.slice(0, 80)}`
        : (t.tags.length > 0 ? `关注维度：${t.tags.slice(0, 3).join("、")}` : `重新检视论点：${t.title}`);

      candidates.push({
        assetKey,
        portfolioWeight: weight,
        daysSinceLastInvestigation: days,
        uncertaintyReason: triggerReason,
        suggestedInvestigation: focusHint,
      });
    }
  }
  // 同 assetKey 去重：保留 days 最大 / 最陈旧的一条
  const bestByAsset = new Map<string, CognitionGap>();
  for (const g of candidates) {
    const prev = bestByAsset.get(g.assetKey);
    if (!prev || g.daysSinceLastInvestigation > prev.daysSinceLastInvestigation) {
      bestByAsset.set(g.assetKey, g);
    }
  }
  return Array.from(bestByAsset.values())
    .sort((a, b) => b.daysSinceLastInvestigation - a.daysSinceLastInvestigation);
}

export async function surfaceNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    const theses = await thesisStore.getActiveTheses();
    const memCount = await memoryStore.countMemories();

    // P0-3: 读取上次成功运行的 briefing 用于对比
    let previousBriefing: { mindChangeConditions: MindChangeCondition[] } | null = null;
    try {
      const lastRun = await getLatestRun();
      if (lastRun?.briefing) {
        previousBriefing = {
          mindChangeConditions: lastRun.briefing.mindChangeConditions ?? [],
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.surface.previousBriefing", e);
    }

    let data: { surprises: Surprise[]; mindChangeConditions: MindChangeCondition[] } | null = null;
    let tokensUsed = 0;

    // 熔断检查 — surface 节点跳过 LLM 但仍生成基本 briefing
    if (!shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      const prompt = buildSurfacePrompt({
        portfolio: state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 },
        market: state.market ?? { regime: "unknown", vix: null, indicators: {} },
        theses,
        surprises: state.surprises ?? [],
        thesesUpdated: state.thesesUpdated ?? 0,
        memoriesCreated: state.memoriesCreated ?? 0,
        toolsCalled: state.toolsCalled ?? [],
        reasoningTraces: state.reasoningTraces ?? [],
        previousBriefing,
      });

      const llmResult = await callDeepSeekJson<{
        surprises: Surprise[];
        mindChangeConditions: MindChangeCondition[];
      }>(prompt, "cognitiveGraph.surface");
      data = llmResult.data;
      tokensUsed = llmResult.tokensUsed;

      // P0-2: 校验 surface 输出（cognitionGaps 已改由代码直出，不再由 LLM 生成）
      if (data) {
        const valErrors = validateShape(data, { surprises: "array", mindChangeConditions: "array" });
        if (valErrors.length > 0) {
          logSwallowed("cognitiveGraph.surface.validation", new Error(valErrors.join("; ")));
          if (!Array.isArray(data.surprises)) data.surprises = [];
          if (!Array.isArray(data.mindChangeConditions)) data.mindChangeConditions = [];
        }
        // LLM 偶尔会把 surprises 写成字符串数组或字段缺失的对象 —
        // 把它们原样塞进 briefing 会让 UI 渲染出无标题的 severity badge。
        // 统一规范字段并强制 severity >= 3 + 非空 title。
        const rawSurprises: unknown[] = Array.isArray(data.surprises) ? data.surprises : [];
        data.surprises = rawSurprises
          .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
          .map((s) => {
            const title = typeof s.title === "string" ? s.title.trim() : "";
            const description = typeof s.description === "string" ? s.description.trim() : "";
            const severity = Number(s.severityScore);
            return {
              title,
              description,
              relatedThesisId: typeof s.relatedThesisId === "string" ? s.relatedThesisId : null,
              severityScore: Number.isFinite(severity) ? Math.max(1, Math.min(10, Math.round(severity))) : 0,
              suggestedAction: typeof s.suggestedAction === "string" ? s.suggestedAction : "",
            };
          })
          .filter((s) => s.title.length > 0 && s.severityScore >= 3);
      }
    }

    // Feature B: 组合级风险建模（纯计算，无 LLM）
    const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
    const thesisFailureImpacts: ThesisFailureImpact[] = [];
    for (const t of theses) {
      if (t.conviction !== "high" && t.conviction !== "medium") continue;
      const affected = portfolio.holdings.filter(h => t.assetKeys.includes(h.assetKey));
      if (affected.length === 0) continue;
      const totalExposurePct = affected.reduce((sum, h) => sum + h.weightPct, 0);
      const lossMultiplier = t.conviction === "high" ? 0.5 : 0.3;
      const estimatedLossPct = totalExposurePct * lossMultiplier;
      const riskLevel = estimatedLossPct > 0.15 ? "critical" : estimatedLossPct > 0.1 ? "high" : estimatedLossPct > 0.05 ? "medium" : "low";
      thesisFailureImpacts.push({
        threadId: t.id,
        thesisTitle: t.title,
        conviction: t.conviction,
        affectedAssets: affected.map(h => ({ assetKey: h.assetKey, weightPct: h.weightPct })),
        totalExposurePct,
        estimatedLossPct,
        riskLevel,
      });
    }

    // Feature C: Thesis 冲突检测（代码层 — 资产重叠 + 方向矛盾）
    // P0-2: uncertain 多为 prioritizeNode 创建的调查型 thesis（如"评估XX"），不是真正的反方观点，需排除
    const directionalTheses = theses.filter(t => t.conviction !== "uncertain");
    const thesisConflicts: ThesisConflict[] = [];
    for (let i = 0; i < directionalTheses.length; i++) {
      for (let j = i + 1; j < directionalTheses.length; j++) {
        const a = directionalTheses[i];
        const b = directionalTheses[j];
        const overlap = a.assetKeys.filter(k => b.assetKeys.includes(k));
        if (overlap.length === 0) continue;
        // 方向矛盾：必须是 high/medium 和 low 的真正对立（两边都是看多或都是看空则不冲突）
        const aBullish = a.conviction === "high" || a.conviction === "medium";
        const bBullish = b.conviction === "high" || b.conviction === "medium";
        if (aBullish === bBullish) continue; // 同方向不冲突
        const severity = overlap.length >= 2 ? "high" : (a.conviction === "high" || b.conviction === "high") ? "high" : "medium";
        thesisConflicts.push({
          thesisA: { id: a.id, title: a.title, conviction: a.conviction },
          thesisB: { id: b.id, title: b.title, conviction: b.conviction },
          conflictType: "directional",
          overlappingAssets: overlap,
          severity,
          llmAssessment: null,
        });
      }
    }

    const totalTkn = (state.totalTokens ?? 0) + tokensUsed;

    // Phase 4: 汇总子 agent 结果
    const subAgentSummaries = (state.subAgentResults ?? []).length > 0
      ? (state.subAgentResults ?? []).map(r => ({
          threadId: r.threadId,
          threadTitle: r.threadTitle,
          summary: r.summary,
          thesisChanged: r.thesisChanged,
          toolsUsed: r.toolsUsed,
        }))
      : undefined;

    // 代码直出“自动跟踪清单”（取代原 LLM 生成的 cognitionGaps）
    const dueForReview = computeDueForReview(theses, portfolio);

    const briefing: DailyBriefing = {
      surprises: data?.surprises ?? state.surprises ?? [],
      cognitionGaps: dueForReview,
      mindChangeConditions: data?.mindChangeConditions ?? [],
      thesisFailureImpacts,
      thesisConflicts,
      subAgentSummaries,
      thesesUpdated: state.thesesUpdated ?? 0,
      memoriesCreated: state.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };

    // 策略顾问 LLM — 生成 Agent 目标权重计划
    if (state.agentConfig?.enabled !== false && !shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      try {
        // 策略参数实时从 systemConfig 读取，避免 agentConfig 副本陈旧
        const { getDaaSystemConfig } = await import("@/src/daa/store/accountStore");
        const sysCfg = await getDaaSystemConfig().catch(() => null);
        const defaultDriftThresholdPct = sysCfg?.config.rebalanceStrategy?.drift?.thresholdPct ?? 0.05;
        const maxPositionPct = sysCfg?.config.strategy?.constraints?.maxPositionPct ?? 0.30;

        const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
        const advisorPrompt = buildStrategyAdvisorPrompt({
          holdings: portfolio.holdings.map(h => ({
            assetKey: h.assetKey,
            symbol: parseDaaAssetKey(h.assetKey)?.symbol ?? h.assetKey,
            weightPct: h.weightPct,
            price: h.lastPrice ?? 0,
          })),
          theses,
          surprises: briefing.surprises,
          cognitionGaps: briefing.cognitionGaps,
          ruleRegime: state.market?.regime ?? "unknown",
          defaultDriftThresholdPct,
          maxPositionPct,
        });

        const overlayResult = await callDeepSeekJson<Omit<AgentConfigOverlay, "generatedAt" | "agentRunId">>(
          advisorPrompt, "cognitiveGraph.surface.advisor", { tier: "fast" },
        );
        tokensUsed += overlayResult.tokensUsed;

        if (overlayResult.data) {
          const raw = overlayResult.data;
          const targetAllocationPlan = raw.targetAllocationPlan && typeof raw.targetAllocationPlan === "object"
            ? {
              reasoning: String(raw.targetAllocationPlan.reasoning || "").slice(0, 500),
              intents: (Array.isArray(raw.targetAllocationPlan.intents) ? raw.targetAllocationPlan.intents : [])
                .filter((item) => (
                  item
                  && typeof item === "object"
                  && Number.isFinite(Number(item.proposedTargetWeightPct))
                  && Number(item.proposedTargetWeightPct) >= 0
                  && Number.isFinite(Number(item.confidence))
                  && Number(item.confidence) >= 0
                ))
                .slice(0, 12)
                .map((item) => ({
                  assetKey: String(item.assetKey || "").trim(),
                  symbol: String(item.symbol || "").trim(),
                  proposedTargetWeightPct: Number(item.proposedTargetWeightPct),
                  confidence: Number(item.confidence),
                  reasoning: String(item.reasoning || "").slice(0, 300),
                })),
            }
            : null;

          briefing.configOverlay = {
            generatedAt: new Date().toISOString(),
            agentRunId: `surface-${new Date().toISOString()}`,
            regimeOverride: raw.regimeOverride && typeof raw.regimeOverride === "object"
              ? { ...raw.regimeOverride, ruleBasedRegime: state.market?.regime ?? "unknown" }
              : null,
            targetAllocationPlan,
          };

          // 更新 briefing token 计数
          briefing.totalTokens += overlayResult.tokensUsed;
          briefing.estimatedCost = briefing.totalTokens * DEEPSEEK_AVG_COST_PER_TOKEN;
        }
      } catch (e) {
        logSwallowed("cognitiveGraph.surface.advisor", e);
      }
    }

    // 尝试推送 Telegram（非阻塞）
    try {
      const system = await getDaaSystemConfig();
      if (!shouldSendAgentBriefingTelegram(system.config)) {
        return {
          briefing, // 将完整 briefing 传入状态
          totalTokens: tokensUsed,
          reasoningTraces: [{
            node: "surface",
            threadId: null,
            input: `${theses.length} theses, ${(state.surprises ?? []).length} surprises`,
            output: `briefing: ${briefing.surprises.length} surprises, ${briefing.cognitionGaps.length} gaps, ${briefing.mindChangeConditions.length} conditions`,
            tokensUsed,
            durationMs: Date.now() - t0,
          }],
        };
      }
      const { sendTelegramByEnv } = await import("@/src/daa/notify/telegram");
      const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
      const tgText = formatBriefingForTelegram(briefing, {
        totalTokens: briefing.totalTokens,
        durationMs: Date.now() - t0,
        thesesCount: theses.length,
        memoriesCount: memCount,
        portfolio: {
          holdings: portfolio.holdings.map(h => ({
            ...h,
            valuationBase: h.lastPrice * h.holdingQty,
          })),
          totalEquity: portfolio.totalEquity,
          cashPct: portfolio.cashPct,
          marketRegime: state.market?.regime ?? undefined,
        },
      });
      sendTelegramByEnv(tgText, {
        eventType: "agent_briefing",
        triggerSource: "cognitive_agent",
        parseMode: "HTML",
      }).catch(e => logSwallowed("cognitiveGraph.surface.telegram", e));
    } catch (e) {
      logSwallowed("cognitiveGraph.surface.telegramImport", e);
    }

    return {
      briefing, // 将完整 briefing 传入状态
      totalTokens: tokensUsed,
      reasoningTraces: [{
        node: "surface",
        threadId: null,
        input: `${theses.length} theses, ${(state.surprises ?? []).length} surprises`,
        output: `briefing: ${briefing.surprises.length} surprises, ${briefing.cognitionGaps.length} gaps, ${briefing.mindChangeConditions.length} conditions`,
        tokensUsed,
        durationMs: Date.now() - t0,
      }],
    };
  } catch (e) {
    logSwallowed("cognitiveGraph.surface", e);
    return { errors: [`surface: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
