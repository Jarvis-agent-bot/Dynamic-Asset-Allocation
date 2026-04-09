/**
 * Embedding 工具 — 为 Agent 记忆生成 384 维向量
 *
 * v0 实现：使用 DeepSeek 的文本能力生成简化的关键词向量。
 * 未来可替换为 sentence-transformers 本地推理或 DeepSeek embedding API。
 */

import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/**
 * 生成文本的 384 维 embedding 向量。
 *
 * v0 策略：简单的哈希向量。不依赖外部 embedding API，零成本。
 * 通过字符级哈希 + 词频统计生成伪向量，用于 pgvector 的余弦相似度搜索。
 * 语义精度有限，但对于 <100 条记忆足够区分不同主题。
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return hashEmbedding(text, 384);
  } catch (e) {
    logSwallowed("embedding.generate", e);
    return Array(384).fill(0);
  }
}

/**
 * 确定性哈希 embedding：基于字符 n-gram 频率。
 * 同一文本总是产生相同的向量（deterministic）。
 * 相似文本产生相似的向量（locality-sensitive）。
 */
function hashEmbedding(text: string, dim: number): number[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const vec = new Float64Array(dim);

  // 字符级 trigram 哈希
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    const h = simpleHash(trigram);
    const idx = Math.abs(h) % dim;
    vec[idx] += h > 0 ? 1 : -1;
  }

  // 词级哈希（补充语义粒度）
  const words = normalized.split(" ").filter(w => w.length > 1);
  for (const word of words) {
    const h = simpleHash(word);
    const idx = Math.abs(h) % dim;
    vec[idx] += (h > 0 ? 1 : -1) * 2; // 词权重高于 trigram
  }

  // L2 归一化
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const result: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) result[i] = Math.round((vec[i] / norm) * 1e6) / 1e6;

  return result;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
