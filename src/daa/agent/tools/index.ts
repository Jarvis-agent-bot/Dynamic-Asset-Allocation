/**
 * Agent Tool System V2 — Barrel 导出
 *
 * import 此文件会触发所有工具的自注册（Hermes 模式）。
 * 在 cognitiveGraph.ts 中 import 一次即可。
 */

// ── 类型导出 ──
export type {
  ToolCategory,
  ToolDefinitionV2,
  ToolResultV2,
  ToolExecutorV2,
  ToolEntryV2,
  ToolExecutionContext,
  ToolParamDef,
} from "@/src/daa/agent/tools/types";

// ── 注册表 API ──
export {
  registerTool,
  getRegisteredTools,
  getToolDefinitions,
  getToolsByCategory,
  getToolByName,
  getRegisteredToolCount,
  executeToolCallV2,
  resolveToolResultVariables,
  formatToolDefinitionsV2ForPrompt,
  clearToolResultCache,
  setCurrentRunId,
  _clearRegistryForTest,
} from "@/src/daa/agent/tools/registry";

// ── 自注册触发（import 顺序无关） ──

// observe 类（6 个）
import "@/src/daa/agent/tools/observe/fetchTechnicalSignal";
import "@/src/daa/agent/tools/observe/fetchValuationSignal";
import "@/src/daa/agent/tools/observe/fetchNewsSignal";
import "@/src/daa/agent/tools/observe/fetchHumanSignal";
import "@/src/daa/agent/tools/observe/queryMarketRegime";
import "@/src/daa/agent/tools/observe/queryPortfolioConcentration";

// analyze 类（3 个，新增）
import "@/src/daa/agent/tools/analyze/backtestThesis";
import "@/src/daa/agent/tools/analyze/computeCorrelation";
import "@/src/daa/agent/tools/analyze/simulateRebalance";

// meta 类（5 个）
import "@/src/daa/agent/tools/meta/queryThesisHistory";
import "@/src/daa/agent/tools/meta/queryPastDecisions";
import "@/src/daa/agent/tools/meta/evaluateSelfAccuracy";
import "@/src/daa/agent/tools/meta/searchPastReasoning";
import "@/src/daa/agent/tools/meta/queryEntityHistory";

// act 类（2 个，新增，需审批）
import "@/src/daa/agent/tools/act/suggestTargetWeight";
import "@/src/daa/agent/tools/act/createThesis";
