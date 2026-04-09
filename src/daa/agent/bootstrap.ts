/**
 * Thesis Bootstrap — 首次运行时为每个持仓生成初始研究论点
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

interface BootstrapAsset {
  assetKey: string;
  symbol: string;
  holdingQty: number;
  lastPrice: number;
}

/**
 * 扫描持仓资产，为每个生成初始 thesis。
 * 仅在 daa_research_threads 为空时执行。
 */
export async function bootstrapTheses(holdings: BootstrapAsset[]): Promise<{
  created: number;
  errors: string[];
}> {
  const count = await thesisStore.countThreads();
  if (count > 0) {
    return { created: 0, errors: ["已存在 thesis，跳过 bootstrap"] };
  }

  const config = await resolveLlmConfig();
  if (!config) {
    return { created: 0, errors: ["LLM 未配置，无法 bootstrap"] };
  }

  let created = 0;
  const errors: string[] = [];

  for (const asset of holdings.slice(0, 30)) {
    try {
      const prompt = `你是一个投资研究分析师。为以下资产生成一个初始研究论点。

资产: ${sanitizeForPrompt(asset.assetKey, 30)}
当前价格: $${asset.lastPrice.toFixed(2)}
持仓数量: ${asset.holdingQty}

请输出严格 JSON：
\`\`\`json
{
  "title": "研究线索标题（简短，如'看多NVDA的AI增长逻辑'）",
  "thesis": "当前核心判断（1-2句话）",
  "conviction": "medium",
  "invalidationConditions": "什么条件会推翻这个判断",
  "tags": ["个股"]
}
\`\`\`

只输出 JSON，不要其他文字。`;

      const { text } = await callLlm(config, prompt);
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
      if (!jsonMatch) {
        errors.push(`${asset.assetKey}: 未找到 JSON`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[1].trim()) as {
        title: string;
        thesis: string;
        conviction: string;
        invalidationConditions: string;
        tags: string[];
      };

      await thesisStore.createResearchThread({
        title: parsed.title,
        thesisText: parsed.thesis,
        conviction: (parsed.conviction as "high" | "medium" | "low" | "uncertain") || "medium",
        invalidationConditions: parsed.invalidationConditions,
        assetKeys: [asset.assetKey],
        tags: parsed.tags ?? ["个股"],
        reviewAt: new Date(Date.now() + 14 * 86400000),
      });
      created++;
    } catch (e) {
      const msg = `${asset.assetKey}: ${e instanceof Error ? e.message : String(e)}`;
      logSwallowed("bootstrap.thesis", e);
      errors.push(msg);
    }
  }

  // 宏观环境 thesis
  try {
    await thesisStore.createResearchThread({
      title: "宏观市场环境评估",
      thesisText: "当前市场环境待评估，需要 Agent 首次运行后更新。",
      conviction: "uncertain",
      invalidationConditions: "市场 regime 发生显著变化",
      assetKeys: [],
      tags: ["宏观"],
      reviewAt: new Date(Date.now() + 7 * 86400000),
    });
    created++;
  } catch (e) {
    logSwallowed("bootstrap.macro", e);
    errors.push(`宏观: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { created, errors };
}
