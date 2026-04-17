/**
 * Agent Tool Registry V2 — 动态注册表
 *
 * 借鉴 Hermes Agent 的自注册模式：每个工具文件在 import 时调用 registerTool()。
 * 支持按 category 查询、变量替换（链式调用）、审批检查。
 */

import type {
  ToolCategory,
  ToolDefinitionV2,
  ToolEntryV2,
  ToolExecutorV2,
  ToolExecutionContext,
  ToolResultV2,
} from "@/src/daa/agent/tools/types";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

// ── 全局注册表 ──

const _registry = new Map<string, ToolEntryV2>();

/** 注册一个工具（在模块 import 时调用） */
export function registerTool(
  definition: ToolDefinitionV2,
  executor: ToolExecutorV2,
): void {
  if (_registry.has(definition.name)) {
    logSwallowed("toolRegistry.register", new Error(`工具重复注册: ${definition.name}`));
  }
  _registry.set(definition.name, { definition, executor });
}

/** 获取所有已注册工具 */
export function getRegisteredTools(): ToolEntryV2[] {
  return Array.from(_registry.values());
}

/** 获取所有已注册工具的定义（不含 executor） */
export function getToolDefinitions(): ToolDefinitionV2[] {
  return Array.from(_registry.values()).map(e => e.definition);
}

/** 按 category 筛选工具 */
export function getToolsByCategory(category: ToolCategory): ToolEntryV2[] {
  return Array.from(_registry.values()).filter(e => e.definition.category === category);
}

/** 按 name 查找单个工具 */
export function getToolByName(name: string): ToolEntryV2 | undefined {
  return _registry.get(name);
}

/** 获取注册工具总数 */
export function getRegisteredToolCount(): number {
  return _registry.size;
}

/** 清空注册表（仅用于测试） */
export function _clearRegistryForTest(): void {
  _registry.clear();
}

// ── 工具执行超时 ──

const TOOL_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`工具 ${toolName} 执行超时 (${timeoutMs}ms)`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// ── 变量替换（链式调用核心）──

/**
 * 解析 params 中的 $tool_results.{toolName}.{field} 引用。
 *
 * 例如 params = { symbol: "$tool_results.fetch_technical_signal.symbol" }
 * 会从 allResults 中查找 fetch_technical_signal 的 outputFields.symbol 并替换。
 */
export function resolveToolResultVariables(
  params: Record<string, unknown>,
  allResults: Map<string, ToolResultV2>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.startsWith("$tool_results.")) {
      // 格式：$tool_results.{toolName}.{field}
      const parts = value.slice("$tool_results.".length).split(".");
      if (parts.length >= 2) {
        const toolName = parts[0];
        const fieldPath = parts.slice(1).join(".");
        const toolResult = allResults.get(toolName);
        if (toolResult?.success && toolResult.outputFields) {
          const fieldValue = getNestedField(toolResult.outputFields, fieldPath);
          resolved[key] = fieldValue !== undefined ? fieldValue : value; // 解析失败保留原值
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** 安全获取嵌套字段（支持 a.b.c 路径） */
function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── 工具结果缓存（同 cycle 内同参数去重）──

const _resultCache = new Map<string, ToolResultV2>();

function buildCacheKey(toolName: string, params: Record<string, unknown>, ctx: ToolExecutionContext): string {
  // 包含 context 身份标识：context-dependent 工具（如 market regime）同参数不同 context 不命中缓存
  const ctxHash = `m=${ctx.market?.regime ?? "null"}_p=${ctx.portfolio?.holdings?.length ?? "null"}`;
  return `${toolName}::${JSON.stringify(params, Object.keys(params).sort())}::${ctxHash}`;
}

/** 清空结果缓存（每个 cycle 开始时调用） */
export function clearToolResultCache(): void {
  _resultCache.clear();
}

// ── 工具执行日志（写入 daa_agent_tool_executions）──

/** 当前 cycle 的 runId（由 cognitiveGraph 在 cycle 开始时设置） */
let _currentRunId: string | null = null;

/** 设置当前运行 ID（供工具执行日志关联） */
export function setCurrentRunId(runId: string | null): void {
  _currentRunId = runId;
}

async function logToolExecution(result: ToolResultV2, inputParams: Record<string, unknown>): Promise<void> {
  if (!_currentRunId) return; // 无 runId 时静默跳过
  try {
    const { withDaaPgClient } = await import("@/src/daa/pg/daaPg");
    await withDaaPgClient(async (client) => {
      await client.query(
        `INSERT INTO daa_agent_tool_executions (run_id, tool_name, category, input_params, output_fields, success, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          _currentRunId,
          result.toolName,
          result.category,
          JSON.stringify(inputParams),
          JSON.stringify(result.outputFields),
          result.success,
          result.latencyMs,
        ],
      );
    });
  } catch (e) {
    logSwallowed("toolRegistry.logExecution", e);
  }
}

// ── 工具执行 ──

/**
 * 执行单个工具调用（V2 版本）。
 *
 * 功能链：审批检查 → 缓存命中 → 变量替换 → 超时执行 → DB 日志
 * 永不抛出异常。
 */
export async function executeToolCallV2(
  toolName: string,
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
  allResults?: Map<string, ToolResultV2>,
): Promise<ToolResultV2> {
  const t0 = Date.now();
  const entry = _registry.get(toolName);

  if (!entry) {
    return {
      toolName,
      category: "observe",
      success: false,
      data: null,
      outputFields: {},
      error: `未知工具: ${toolName}`,
      latencyMs: Date.now() - t0,
    };
  }

  // 1. 审批门禁：act 类工具标记 requiresApproval 时拒绝自动执行
  if (entry.definition.requiresApproval) {
    return {
      toolName,
      category: entry.definition.category,
      success: false,
      data: null,
      outputFields: {},
      error: `工具 ${toolName} 需要用户确认才能执行（requiresApproval=true）`,
      latencyMs: Date.now() - t0,
    };
  }

  // 2. 变量替换
  const resolvedParams = allResults
    ? resolveToolResultVariables(params, allResults)
    : params;

  // 3. 缓存命中检查（同 cycle 内同参数去重）
  const cacheKey = buildCacheKey(toolName, resolvedParams, ctx);
  const cached = _resultCache.get(cacheKey);
  if (cached) {
    return { ...cached, latencyMs: 0 }; // 缓存命中，0ms 延迟
  }

  // 4. 执行
  let result: ToolResultV2;
  try {
    result = await withTimeout(
      entry.executor(resolvedParams, ctx),
      TOOL_TIMEOUT_MS,
      toolName,
    );
  } catch (e) {
    logSwallowed(`toolRegistry.execute.${toolName}`, e);
    result = {
      toolName,
      category: entry.definition.category,
      success: false,
      data: null,
      outputFields: {},
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - t0,
    };
  }

  // 5. 写入缓存
  if (result.success) {
    _resultCache.set(cacheKey, result);
  }

  // 6. 异步写入 DB 日志（不阻塞返回）
  logToolExecution(result, resolvedParams).catch(() => {});

  return result;
}

// ── Prompt 格式化 ──

/** 将 V2 工具定义格式化为 LLM prompt，按 category 分组 */
export function formatToolDefinitionsV2ForPrompt(tools?: ToolDefinitionV2[]): string {
  const defs = tools ?? getToolDefinitions();
  const grouped = new Map<ToolCategory, ToolDefinitionV2[]>();
  for (const t of defs) {
    const list = grouped.get(t.category) ?? [];
    list.push(t);
    grouped.set(t.category, list);
  }

  const categoryLabels: Record<ToolCategory, string> = {
    observe: "观察类（只读查询）",
    analyze: "分析类（计算推导）",
    act: "行动类（需确认）",
    meta: "自省类（历史反思）",
  };

  const sections: string[] = [];
  for (const cat of ["observe", "analyze", "meta", "act"] as ToolCategory[]) {
    const list = grouped.get(cat);
    if (!list?.length) continue;
    sections.push(`\n### ${categoryLabels[cat]}`);
    for (const t of list) {
      const params = Object.entries(t.parameters);
      const paramStr = params.length > 0
        ? ` 参数: ${params.map(([k, v]) => `${k}(${v.type}${v.required ? ",必填" : ""}): ${v.description}`).join("; ")}`
        : " 无参数";
      let line = `- **${t.name}**: ${t.description}${paramStr}`;
      if (t.outputSchema) {
        const fields = Object.entries(t.outputSchema).map(([k, v]) => `${k}(${v})`).join(", ");
        line += `\n  输出字段（可用 $tool_results.${t.name}.{field} 引用）: ${fields}`;
      }
      if (t.requiresApproval) {
        line += " ⚠️ 需要确认";
      }
      sections.push(line);
    }
  }

  return sections.join("\n");
}
