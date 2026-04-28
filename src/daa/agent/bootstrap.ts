/**
 * Thesis Bootstrap — 为持仓和观察列表补齐研究论点
 */

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { sanitizeForPrompt } from "@/src/daa/llm/llmSanitize";
import * as thesisStore from "@/src/daa/agent/store/thesisStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export interface BootstrapAsset {
  assetKey: string;
  symbol: string;
  holdingQty: number;
  lastPrice: number;
  role?: "holding" | "watchlist";
  notes?: string | null;
  tags?: string[];
}

function normalizeAsset(asset: BootstrapAsset): BootstrapAsset | null {
  const assetKey = String(asset.assetKey || "").trim();
  const symbol = String(asset.symbol || assetKey).trim();
  if (!assetKey || !symbol) return null;
  return {
    ...asset,
    assetKey,
    symbol,
    holdingQty: Math.max(0, Number(asset.holdingQty) || 0),
    lastPrice: Math.max(0, Number(asset.lastPrice) || 0),
    role: asset.role ?? (asset.holdingQty > 0 ? "holding" : "watchlist"),
    notes: asset.notes ?? null,
    tags: Array.isArray(asset.tags) ? asset.tags.filter(Boolean) : [],
  };
}

function buildCoverageThread(asset: BootstrapAsset) {
  const role = asset.role ?? (asset.holdingQty > 0 ? "holding" : "watchlist");
  const roleLabel = role === "holding" ? "持仓" : "观察列表";
  const priceText = asset.lastPrice > 0 ? `当前价格约 ${asset.lastPrice.toFixed(2)}。` : "当前价格待刷新。";
  const notesText = asset.notes ? `备注：${asset.notes.slice(0, 80)}。` : "";
  return {
    title: `${roleLabel}跟踪：${asset.symbol}`,
    thesisText: role === "holding"
      ? `${asset.symbol} 是当前持仓资产，自动驾驶需要持续验证其趋势、估值、新闻和组合权重是否仍支持当前仓位。${priceText}${notesText}`
      : `${asset.symbol} 来自观察列表，尚未形成高置信度方向；自动驾驶需要持续收集技术、估值、新闻和组合适配证据，再决定是否进入目标权重计划。${priceText}${notesText}`,
    conviction: "uncertain" as const,
    invalidationConditions: role === "holding"
      ? "若趋势转弱、基本面证据恶化、组合集中度过高或风险预算不足，则需要下调目标权重。"
      : "若信号质量不足、估值不具吸引力、新闻证据转弱或组合没有新增风险预算，则继续观察而不建仓。",
    tags: Array.from(new Set([roleLabel, ...(asset.tags ?? [])])).slice(0, 5),
  };
}

export async function ensureAssetThesisCoverage(assets: BootstrapAsset[]): Promise<{
  created: number;
  errors: string[];
}> {
  const normalized = assets
    .map(normalizeAsset)
    .filter((asset): asset is BootstrapAsset => Boolean(asset));
  const byAssetKey = new Map<string, BootstrapAsset>();
  for (const asset of normalized) {
    const existing = byAssetKey.get(asset.assetKey);
    if (!existing || (asset.role === "holding" && existing.role !== "holding")) {
      byAssetKey.set(asset.assetKey, asset);
    }
  }
  const focusAssets = [...byAssetKey.values()].slice(0, 60);
  if (focusAssets.length === 0) return { created: 0, errors: [] };

  const active = await thesisStore.getActiveTheses();
  const covered = new Set(active.flatMap((t) => t.assetKeys));
  let created = 0;
  const errors: string[] = [];

  for (const asset of focusAssets) {
    if (covered.has(asset.assetKey)) continue;
    try {
      const thread = buildCoverageThread(asset);
      await thesisStore.createResearchThread({
        ...thread,
        assetKeys: [asset.assetKey],
        reviewAt: new Date(),
      });
      covered.add(asset.assetKey);
      created++;
    } catch (e) {
      const msg = `${asset.assetKey}: ${e instanceof Error ? e.message : String(e)}`;
      logSwallowed("bootstrap.ensureCoverage", e);
      errors.push(msg);
    }
  }

  return { created, errors };
}

/**
 * 扫描持仓和观察列表资产，为每个生成初始 thesis。
 * 首次为空时走 LLM 初始化；已有论点时只补齐缺失资产的覆盖。
 */
export async function bootstrapTheses(holdings: BootstrapAsset[]): Promise<{
  created: number;
  errors: string[];
}> {
  const count = await thesisStore.countThreads();
  if (count > 0) {
    const coverage = await ensureAssetThesisCoverage(holdings);
    return coverage.created > 0
      ? coverage
      : { created: 0, errors: ["已存在 thesis，且持仓/观察列表覆盖已齐备"] };
  }

  const config = await resolveLlmConfig("research");
  if (!config) {
    return { created: 0, errors: ["LLM 未配置，无法 bootstrap"] };
  }

  let created = 0;
  const errors: string[] = [];

  for (const asset of holdings.slice(0, 30)) {
    try {
      const role = asset.role ?? (asset.holdingQty > 0 ? "holding" : "watchlist");
      const roleLabel = role === "holding" ? "当前持仓" : "观察列表候选";
      const prompt = `你是一个投资研究分析师。为以下${roleLabel}资产生成一个初始研究论点。

资产: ${sanitizeForPrompt(asset.assetKey, 30)}
当前价格: $${asset.lastPrice.toFixed(2)}
持仓数量: ${asset.holdingQty}
角色: ${roleLabel}
备注: ${sanitizeForPrompt(asset.notes ?? "", 80) || "无"}

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
        conviction: role === "watchlist" ? "uncertain" : ((parsed.conviction as "high" | "medium" | "low" | "uncertain") || "medium"),
        invalidationConditions: parsed.invalidationConditions,
        assetKeys: [asset.assetKey],
        tags: Array.from(new Set([...(parsed.tags ?? ["个股"]), ...(asset.tags ?? [])])).slice(0, 5),
        reviewAt: role === "watchlist" ? new Date() : new Date(Date.now() + 14 * 86400000),
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
