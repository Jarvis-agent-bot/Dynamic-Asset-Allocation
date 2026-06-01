/**
 * Cognitive Agent — Review 节点（检查到期待复盘的 thesis）
 */

import type { CognitiveState, CognitiveUpdate } from "@/src/daa/agent/cognitiveState";
import type { ReasoningTrace } from "@/src/daa/agent/cognitiveTypes";
import { buildReviewPrompt } from "@/src/daa/agent/cognitivePrompts";
import { callDeepSeekJson } from "@/src/daa/agent/helpers/llm";
import { validateShape, shouldCircuitBreak } from "@/src/daa/agent/helpers/validation";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { generateEmbedding } from "@/src/daa/agent/embedding";
import * as memoryStore from "@/src/daa/agent/store/memoryStore";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getCurrentRunId } from "@/src/daa/agent/tools/registry";
import { recordAgentDecisionAudit } from "@/src/daa/agent/store/agentDecisionAuditStore";

export async function reviewNode(state: CognitiveState): Promise<CognitiveUpdate> {
  const t0 = Date.now();

  if (shouldCircuitBreak(state.errors ?? [], state.agentConfig?.circuitBreakerThreshold ?? 3)) {
    return { errors: ["review: 熔断 — 跳过"] };
  }

  try {
    const dueTheses = await thesisStore.getDueReviews();
    if (dueTheses.length === 0) return {};

    let totalTokens = 0;
    const traces: ReasoningTrace[] = [];

    for (const thread of dueTheses.slice(0, 3)) {
      try {
        // P1-6: 获取 thesis 关联资产的价格变动作为 ground truth
        let priceChangeText = "";
        if (thread.assetKeys[0]) {
          try {
            const sym = parseDaaAssetKey(thread.assetKeys[0])?.symbol ?? "";
            const createdDate = new Date(thread.createdAt);
            const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
            if (daysSinceCreation > 0 && sym) {
              const lookbackDays = Math.min(daysSinceCreation + 5, 365);
              const startDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
              const cacheResult = await fetchPriceSeriesWithCache(sym, startDate);
              const series = cacheResult?.data ?? [];
              if (series.length >= 2) {
                const firstPrice = series[0].close;
                const lastPrice = series[series.length - 1].close;
                const changePct = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(1);
                priceChangeText = `\n该资产在论点存续期间(${daysSinceCreation}天)内涨跌幅为 ${changePct}%（从 $${firstPrice.toFixed(2)} 到 $${lastPrice.toFixed(2)}）`;
              }
            }
          } catch (e) {
            logSwallowed("cognitiveGraph.review.priceChange", e);
          }
        }

        const prompt = buildReviewPrompt({
          thread,
          marketRegime: state.market?.regime ?? "unknown",
          vix: state.market?.vix ?? null,
          priceChangeText,
        });

        const { data, tokensUsed } = await callDeepSeekJson<{
          actualOutcome: string;
          accuracyScore: number;
          lesson: string | null;
          shouldInvalidate: boolean;
          shouldArchive: boolean;
        }>(prompt, "cognitiveGraph.review");

        totalTokens += tokensUsed;

        // P0-2: 校验 review 输出
        if (data) {
          const valErrors = validateShape(data, {
            actualOutcome: "string",
            accuracyScore: "number",
            shouldInvalidate: "boolean",
            shouldArchive: "boolean",
          });
          if (valErrors.length > 0) {
            logSwallowed(`cognitiveGraph.review.validation.${thread.id}`, new Error(valErrors.join("; ")));
          }
        }

        if (data) {
          // 保存复盘记录（通过 store 层）
          await thesisStore.createThesisReview({
            threadId: thread.id,
            reviewWindow: "30d",
            thesisAtTime: thread.thesisText,
            convictionAtTime: thread.conviction,
            actualOutcome: data.actualOutcome,
            accuracyScore: data.accuracyScore,
            lessonsLearned: data.lesson,
          });

          // 生成教训记忆
          if (data.lesson) {
            const emb = await generateEmbedding(data.lesson);
            await memoryStore.createMemory({
              memoryType: "lesson",
              content: data.lesson,
              relevanceTags: thread.tags,
              embedding: emb,
              thread: { id: thread.id, assetKeys: thread.assetKeys, tags: thread.tags },
            });
          }

          await recordAgentDecisionAudit({
            agentRunId: getCurrentRunId(),
            node: "review",
            decisionKind: "thesis_review",
            assetKey: thread.assetKeys[0] ?? null,
            symbol: thread.assetKeys[0] ? (parseDaaAssetKey(thread.assetKeys[0])?.symbol ?? thread.assetKeys[0]) : null,
            summary: data.shouldInvalidate
              ? "复盘判定论点失效"
              : data.shouldArchive
                ? "复盘判定论点归档"
                : "复盘判定继续观察",
            reasoning: data.lesson || data.actualOutcome,
            confidencePct: data.accuracyScore,
            inputSnapshot: {
              threadId: thread.id,
              title: thread.title,
              thesisText: thread.thesisText,
              conviction: thread.conviction,
              assetKeys: thread.assetKeys,
              marketRegime: state.market?.regime ?? "unknown",
              vix: state.market?.vix ?? null,
              priceChangeText,
            },
            evidenceSnapshot: {
              invalidationConditions: thread.invalidationConditions,
              tags: thread.tags,
            },
            decisionPayload: {
              actualOutcome: data.actualOutcome,
              accuracyScore: data.accuracyScore,
              lesson: data.lesson,
              shouldInvalidate: data.shouldInvalidate,
              shouldArchive: data.shouldArchive,
            },
          }).catch((error) => logSwallowed(`cognitiveGraph.review.decisionAudit.${thread.id}`, error));

          // 更新 thesis：失效 / 归档 / 继续观察（按优先级判定）
          if (data.shouldInvalidate) {
            await thesisStore.updateThesis(thread.id, { status: "invalidated" });
          } else if (data.shouldArchive) {
            await thesisStore.updateThesis(thread.id, { status: "archived" });
          } else {
            await thesisStore.updateThesis(thread.id, {
              reviewAt: new Date(Date.now() + 30 * 86400000),
            });
          }
        }

        traces.push({
          node: "review",
          threadId: thread.id,
          input: thread.title,
          output: data
            ? `accuracy=${data.accuracyScore}, ${data.shouldInvalidate ? "invalidated" : data.shouldArchive ? "archived" : "kept"}`
            : "no result",
          tokensUsed,
          durationMs: Date.now() - t0,
        });
      } catch (e) {
        logSwallowed(`cognitiveGraph.review.${thread.id}`, e);
      }
    }

    return { totalTokens, reasoningTraces: traces };
  } catch (e) {
    logSwallowed("cognitiveGraph.review", e);
    return { errors: [`review: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
