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
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

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
            const sym = thread.assetKeys[0].split(":")[1] ?? thread.assetKeys[0];
            const createdDate = new Date(thread.createdAt);
            const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / 86400000);
            if (daysSinceCreation > 0 && sym) {
              const cacheResult = await fetchPriceSeriesWithCache(sym, `${Math.min(daysSinceCreation + 5, 365)}d`);
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
          shouldArchive: boolean;
        }>(prompt, "cognitiveGraph.review");

        totalTokens += tokensUsed;

        // P0-2: 校验 review 输出
        if (data) {
          const valErrors = validateShape(data, { actualOutcome: "string", accuracyScore: "number", shouldArchive: "boolean" });
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

          // 更新 thesis：设定下次复盘或归档
          if (data.shouldArchive) {
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
          output: data ? `accuracy=${data.accuracyScore}, archive=${data.shouldArchive}` : "no result",
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
