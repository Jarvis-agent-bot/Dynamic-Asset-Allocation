/**
 * Embedding 工具 — 为经验库记录生成 1024 维向量
 *
 * 可插拔 provider 架构：
 * 1. SiliconFlow（默认推荐，免费额度，BGE-M3 中英双语优秀）
 * 2. DeepSeek embedding-v2（极便宜 ~$0.01/M tokens，768 维）
 * 3. OpenAI text-embedding-3-small（$0.02/M tokens，支持 dimensions=1024）
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  推荐：SiliconFlow 免费 API                                  │
 * │                                                             │
 * │  1. 注册: https://cloud.siliconflow.cn/                     │
 * │  2. 创建 API Key: 控制台 → API 密钥 → 新建                    │
 * │  3. 配置 .env.local:                                        │
 * │     DAA_EMBEDDING_PROVIDER=siliconflow                      │
 * │     DAA_EMBEDDING_API_KEY=sk-xxx                            │
 * │                                                             │
 * │  免费额度包含 BGE-M3 模型（1024 维，中英双语表现优秀）          │
 * │  官方文档: https://docs.siliconflow.cn/api-reference/embeddings │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 配置优先级：env var > DB secrets > 复用 LLM API key
 *
 * 环境变量：
 * - DAA_EMBEDDING_PROVIDER: siliconflow | deepseek | openai（默认 siliconflow）
 * - DAA_EMBEDDING_API_KEY: embedding 专用 key（可选，默认复用 LLM key）
 * - DAA_EMBEDDING_ENDPOINT: 自定义 endpoint（可选）
 * - DAA_EMBEDDING_MODEL: 自定义模型名（可选）
 */

import { resolveSecret } from "@/src/daa/config/secretsManager";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 常量 ──

const TARGET_DIM = 1024;
const TIMEOUT_MS = 15_000;

// ── Provider 配置 ──

type EmbeddingProvider = "siliconflow" | "deepseek" | "openai" | "ollama";

interface ProviderConfig {
  endpoint: string;
  model: string;
  outputDim: number; // 原始输出维度
  supportsNativeDim: boolean; // 是否支持 dimensions 参数
  /** 是否需要 API Key（ollama 本地部署不需要） */
  requiresApiKey: boolean;
}

const PROVIDER_DEFAULTS: Record<EmbeddingProvider, ProviderConfig> = {
  siliconflow: {
    endpoint: "https://api.siliconflow.cn/v1/embeddings",
    model: "BAAI/bge-m3",
    outputDim: 1024,
    supportsNativeDim: false,
    requiresApiKey: true,
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/embeddings",
    model: "deepseek-embedding-v2",
    outputDim: 768,
    supportsNativeDim: false,
    requiresApiKey: true,
  },
  openai: {
    endpoint: "https://api.openai.com/v1/embeddings",
    model: "text-embedding-3-small",
    outputDim: 1536,
    supportsNativeDim: true, // 支持 dimensions 参数
    requiresApiKey: true,
  },
  ollama: {
    // 本地 sidecar（OpenAI 兼容路径），默认 docker-compose 内部主机名 ollama:11434
    endpoint: "http://ollama:11434/v1/embeddings",
    model: "bge-m3",
    outputDim: 1024,
    supportsNativeDim: false,
    requiresApiKey: false,
  },
};

// ── 配置解析 ──

interface ResolvedEmbeddingConfig {
  provider: EmbeddingProvider;
  endpoint: string;
  model: string;
  apiKey: string;
  supportsNativeDim: boolean;
}

async function resolveEmbeddingConfig(): Promise<ResolvedEmbeddingConfig | null> {
  // 1. 读取 provider
  const providerEnv = process.env.DAA_EMBEDDING_PROVIDER?.toLowerCase().trim() || "";
  const provider: EmbeddingProvider =
    providerEnv === "deepseek" ? "deepseek"
    : providerEnv === "openai" ? "openai"
    : providerEnv === "ollama" ? "ollama"
    : "siliconflow"; // 默认

  const defaults = PROVIDER_DEFAULTS[provider];

  // 2. 读取 API Key：DB secrets（embedding_api_key）> 复用 LLM key
  // ollama 本地部署不需要 key
  let apiKey = "";
  if (defaults.requiresApiKey) {
    try {
      apiKey = await resolveSecret("embedding_api_key");
    } catch {
      // ignore
    }
    if (!apiKey) {
      // SiliconFlow provider 不能复用 DeepSeek 的 key，只有同 provider 时才复用
      const llmProvider = process.env.DAA_LLM_PROVIDER?.toLowerCase().trim() || "deepseek";
      if (provider === llmProvider || provider === "deepseek") {
        try {
          apiKey = await resolveSecret("llm_api_key");
        } catch {
          apiKey = "";
        }
      }
    }
    if (!apiKey) return null; // 需要 key 但没有
  }

  // 3. endpoint / model 可自定义（env > DB secrets > 默认值）
  let endpoint = "";
  try { endpoint = await resolveSecret("embedding_endpoint"); } catch { /* ignore */ }
  if (!endpoint) endpoint = defaults.endpoint;

  let model = "";
  try { model = await resolveSecret("embedding_model"); } catch { /* ignore */ }
  if (!model) model = defaults.model;

  return { provider, endpoint, model, apiKey, supportsNativeDim: defaults.supportsNativeDim };
}

// ── API 调用 ──

async function callEmbeddingApi(config: ResolvedEmbeddingConfig, text: string): Promise<number[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // OpenAI 兼容格式（SiliconFlow / DeepSeek / OpenAI 都支持）
    const body: Record<string, unknown> = {
      model: config.model,
      input: text,
      encoding_format: "float",
    };

    // OpenAI text-embedding-3 支持原生维度截断
    if (config.supportsNativeDim) {
      body.dimensions = TARGET_DIM;
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Embedding API ${response.status}: ${errBody.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const rawEmbedding = payload.data?.[0]?.embedding;
    if (!rawEmbedding || rawEmbedding.length === 0) {
      throw new Error("Embedding API 返回空向量");
    }

    // 截断到 TARGET_DIM（如果 API 不支持原生维度控制）
    return resizeAndNormalize(rawEmbedding, TARGET_DIM);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 将向量调整到目标维度并 L2 归一化。
 * - 高维 → 截断（MRL 训练的模型如 BGE-M3、OpenAI 支持直接截断）
 * - 低维 → zero-pad 补齐（如 DeepSeek 768 维 → 1024 维）
 */
function resizeAndNormalize(vec: number[], dim: number): number[] {
  let resized: number[];
  if (vec.length > dim) {
    resized = vec.slice(0, dim);
  } else if (vec.length < dim) {
    resized = [...vec, ...Array(dim - vec.length).fill(0)];
  } else {
    resized = vec;
  }

  // L2 归一化
  let norm = 0;
  for (let i = 0; i < resized.length; i++) norm += resized[i] * resized[i];
  norm = Math.sqrt(norm) || 1;

  return resized.map(v => Math.round((v / norm) * 1e6) / 1e6);
}

// ── 公共 API ──

/** 缓存配置解析结果（进程生命周期内） */
let _configCache: { resolved: ResolvedEmbeddingConfig | null; resolvedAt: number } | null = null;
const CONFIG_CACHE_TTL = 5 * 60_000; // 5 分钟

async function getConfig(): Promise<ResolvedEmbeddingConfig | null> {
  if (_configCache && Date.now() - _configCache.resolvedAt < CONFIG_CACHE_TTL) {
    return _configCache.resolved;
  }
  const resolved = await resolveEmbeddingConfig();
  _configCache = { resolved, resolvedAt: Date.now() };
  return resolved;
}

/** 已输出过配置缺失警告（避免刷屏） */
let _warnedNoConfig = false;

/**
 * 生成文本的 384 维 embedding 向量。
 *
 * 使用真实 Embedding API（SiliconFlow/DeepSeek/OpenAI）。
 * 未配置 API key 时返回零向量并打印警告。
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const config = await getConfig();

    if (!config) {
      if (!_warnedNoConfig) {
        _warnedNoConfig = true;
        console.warn(
          "[embedding] ⚠️ Embedding API 未配置，记忆语义检索不可用。\n" +
          "  选项 1 — 本地 Ollama（docker-compose 自带）：\n" +
          "     DAA_EMBEDDING_PROVIDER=ollama\n" +
          "     （无需 key；首次运行执行 `docker exec daa-ollama ollama pull bge-m3`）\n" +
          "  选项 2 — SiliconFlow 免费 API:\n" +
          "     DAA_EMBEDDING_PROVIDER=siliconflow\n" +
          "     DAA_EMBEDDING_API_KEY=sk-xxx（注册于 https://cloud.siliconflow.cn/）\n",
        );
      }
      return Array(TARGET_DIM).fill(0);
    }

    return await callEmbeddingApi(config, text);
  } catch (e) {
    logSwallowed("embedding.generate", e);
    return Array(TARGET_DIM).fill(0);
  }
}

/** 返回当前使用的 embedding provider 信息（用于诊断） */
export async function getEmbeddingProviderInfo(): Promise<{
  provider: string;
  model: string;
  endpoint: string;
  isRealEmbedding: boolean;
}> {
  const config = await getConfig();
  if (config) {
    return {
      provider: config.provider,
      model: config.model,
      endpoint: config.endpoint,
      isRealEmbedding: true,
    };
  }
  return {
    provider: "none",
    model: "未配置 — 请设置 DAA_EMBEDDING_API_KEY",
    endpoint: "https://cloud.siliconflow.cn/",
    isRealEmbedding: false,
  };
}
