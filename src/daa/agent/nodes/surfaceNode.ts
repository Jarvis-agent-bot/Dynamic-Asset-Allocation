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

export async function surfaceNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();
  try {
    const theses = await thesisStore.getActiveTheses();
    const memCount = await memoryStore.countMemories();

    // P0-3: 读取上次成功运行的 briefing 用于对比
    let previousBriefing: { mindChangeConditions: MindChangeCondition[]; cognitionGaps: CognitionGap[] } | null = null;
    try {
      const lastRun = await getLatestRun();
      if (lastRun?.briefing) {
        previousBriefing = {
          mindChangeConditions: lastRun.briefing.mindChangeConditions ?? [],
          cognitionGaps: lastRun.briefing.cognitionGaps ?? [],
        };
      }
    } catch (e) {
      logSwallowed("cognitiveGraph.surface.previousBriefing", e);
    }

    let data: { surprises: Surprise[]; cognitionGaps: CognitionGap[]; mindChangeConditions: MindChangeCondition[] } | null = null;
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
        cognitionGaps: CognitionGap[];
        mindChangeConditions: MindChangeCondition[];
      }>(prompt, "cognitiveGraph.surface");
      data = llmResult.data;
      tokensUsed = llmResult.tokensUsed;

      // P0-2: 校验 surface 输出
      if (data) {
        const valErrors = validateShape(data, { surprises: "array", cognitionGaps: "array", mindChangeConditions: "array" });
        if (valErrors.length > 0) {
          logSwallowed("cognitiveGraph.surface.validation", new Error(valErrors.join("; ")));
          // 保留有效部分
          if (!Array.isArray(data.surprises)) data.surprises = [];
          if (!Array.isArray(data.cognitionGaps)) data.cognitionGaps = [];
          if (!Array.isArray(data.mindChangeConditions)) data.mindChangeConditions = [];
        }
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

    // Feature C: Thesis 冲突检测（代码层 — 资产重叠 + conviction 矛盾）
    const thesisConflicts: ThesisConflict[] = [];
    for (let i = 0; i < theses.length; i++) {
      for (let j = i + 1; j < theses.length; j++) {
        const a = theses[i];
        const b = theses[j];
        const overlap = a.assetKeys.filter(k => b.assetKeys.includes(k));
        if (overlap.length === 0) continue;
        // 方向矛盾：一个 high/medium，另一个 low/uncertain
        const aPositive = a.conviction === "high" || a.conviction === "medium";
        const bPositive = b.conviction === "high" || b.conviction === "medium";
        if (aPositive === bPositive) continue; // 同方向不冲突
        const severity = overlap.length >= 2 ? "high" : aPositive && a.conviction === "high" ? "high" : "medium";
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

    const briefing: DailyBriefing = {
      surprises: data?.surprises ?? state.surprises ?? [],
      cognitionGaps: data?.cognitionGaps ?? [],
      mindChangeConditions: data?.mindChangeConditions ?? [],
      thesisFailureImpacts,
      thesisConflicts,
      subAgentSummaries,
      thesesUpdated: state.thesesUpdated ?? 0,
      memoriesCreated: state.memoriesCreated ?? 0,
      totalTokens: totalTkn,
      estimatedCost: totalTkn * DEEPSEEK_AVG_COST_PER_TOKEN,
    };

    // 策略顾问 LLM — 生成 Agent Config Overlay（仅在 agentOverlayEnabled 时）
    if (state.agentConfig?.agentOverlayEnabled && !shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
      try {
        const portfolio = state.portfolio ?? { holdings: [], totalEquity: 0, cashPct: 0 };
        const advisorPrompt = buildStrategyAdvisorPrompt({
          holdings: portfolio.holdings.map(h => ({
            assetKey: h.assetKey,
            symbol: h.assetKey.split(":").pop() ?? h.assetKey,
            weightPct: h.weightPct,
            price: h.lastPrice ?? 0,
          })),
          theses,
          surprises: briefing.surprises,
          cognitionGaps: briefing.cognitionGaps,
          ruleRegime: state.market?.regime ?? "unknown",
          defaultDriftThresholdPct: state.agentConfig?.defaultDriftThresholdPct ?? 0.05,
          maxPositionPct: state.agentConfig?.maxPositionPct ?? 0.30,
        });

        const overlayResult = await callDeepSeekJson<Omit<AgentConfigOverlay, "generatedAt" | "agentRunId">>(
          advisorPrompt, "cognitiveGraph.surface.advisor", { tier: "fast" },
        );
        tokensUsed += overlayResult.tokensUsed;

        if (overlayResult.data) {
          const raw = overlayResult.data;
          // 安全校验：clamp 范围
          const driftOverrides = (Array.isArray(raw.driftOverrides) ? raw.driftOverrides : [])
            .filter(o => o.recommendedThresholdPct >= 0.02 && o.recommendedThresholdPct <= 0.15);
          const riskAdjustments = (Array.isArray(raw.riskAdjustments) ? raw.riskAdjustments : [])
            .filter(o => o.maxPositionPctOverride >= 0.10 && o.maxPositionPctOverride <= 0.30);

          briefing.configOverlay = {
            generatedAt: new Date().toISOString(),
            agentRunId: `surface-${new Date().toISOString()}`,
            driftOverrides,
            regimeOverride: raw.regimeOverride && typeof raw.regimeOverride === "object"
              ? { ...raw.regimeOverride, ruleBasedRegime: state.market?.regime ?? "unknown" }
              : null,
            riskAdjustments,
            rebalanceTrigger: raw.rebalanceTrigger && typeof raw.rebalanceTrigger === "object"
              ? raw.rebalanceTrigger
              : null,
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
