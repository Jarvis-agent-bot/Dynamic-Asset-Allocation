import type { DaaChatIntentKind } from "./chatTypes";
import type { DaaAssistantIntent } from "./assistantIntentTypes";

const BUY_WORDS = /(^|[\s，,。.!?？；;])(买入|买|buy)\s+/i;
const SELL_WORDS = /(^|[\s，,。.!?？；;])(卖出|卖|sell)\s+/i;
const TRADE_PATTERN = /(买入|买|buy|卖出|卖|sell)\s+([A-Za-z][A-Za-z0-9.\-]{0,20})(?:\s+([\d.]+)\s*(股|份|usd|usdt|美元|刀|元)?)?/i;
const ANALYSIS_WORDS = /(建议|分析|解释|怎么看|为什么|如何看|判断|复盘|总结|优化|合理吗|应该|帮我想|给我方案)/i;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseTrade(text: string): DaaAssistantIntent | null {
  const match = text.match(TRADE_PATTERN);
  if (!match) return null;
  const action = String(match[1] || "").toLowerCase();
  const symbol = String(match[2] || "").trim().toUpperCase();
  const amount = match[3] == null ? null : Number(match[3]);
  const unit = String(match[4] || "").trim().toLowerCase();
  if (!symbol) return null;
  const side = (action === "卖" || action === "卖出" || action === "sell") ? "SELL" : "BUY";
  const isNotional = unit === "usd" || unit === "usdt" || unit === "美元" || unit === "刀" || unit === "元";
  return {
    kind: "trade",
    rawText: text,
    side,
    symbol,
    qty: amount == null ? null : isNotional ? null : amount,
    notional: amount == null ? null : isNotional ? amount : null,
  };
}

function downgradeExecutionIntent(intent: DaaAssistantIntent, allowExecution: boolean): DaaAssistantIntent {
  if (allowExecution) return intent;
  if (intent.kind === "trade" || intent.kind === "rebalance_execute" || intent.kind === "confirm_action") {
    return {
      kind: "llm_answer",
      rawText: intent.rawText,
      answer: null,
    };
  }
  return intent;
}

export function parseAssistantIntent(raw: string, options?: {
  allowExecution?: boolean;
}): DaaAssistantIntent {
  const text = normalizeText(raw);
  const allowExecution = options?.allowExecution !== false;
  if (!text) return { kind: "help", rawText: raw };

  if (/^\/?(help|start|帮助|说明)$/i.test(text)) return { kind: "help", rawText: text };
  if (/^\/?(confirm|确认|确认执行|继续执行|yes|ok)$/i.test(text)) {
    return downgradeExecutionIntent({ kind: "confirm_action", rawText: text }, allowExecution);
  }
  if (/^\/?(cancel|取消|停止|放弃|no)$/i.test(text)) return { kind: "cancel_action", rawText: text };
  if (/^\/?(status|portfolio|持仓|仓位|组合|账户|状态)$/i.test(text) || /组合.*(状态|仓位|持仓)/.test(text)) {
    return { kind: "portfolio_status", rawText: text };
  }
  if (/风险|风控|risk/i.test(text)) return { kind: "risk_status", rawText: text };
  if (/市场|行情|market/i.test(text) && !/买入|卖出|buy|sell/i.test(text)) return { kind: "market_status", rawText: text };
  if (/最近.*(调仓|周期|再平衡)|latest cycle|最近一次/.test(text)) return { kind: "latest_cycle", rawText: text };
  if (/生成.*(调仓|再平衡)|\/rebalance\s+generate/i.test(text)) return { kind: "rebalance_generate", rawText: text };
  if (/执行.*(调仓|再平衡)|\/rebalance\s+(exec|execute)/i.test(text)) {
    return downgradeExecutionIntent({ kind: "rebalance_execute", rawText: text, executeMode: "all" }, allowExecution);
  }
  if (BUY_WORDS.test(text) || SELL_WORDS.test(text)) {
    return downgradeExecutionIntent(parseTrade(text) || { kind: "unknown", rawText: text }, allowExecution);
  }
  if (ANALYSIS_WORDS.test(text) || text.length >= 18) {
    return { kind: "llm_answer", rawText: text, answer: null };
  }
  return { kind: "unknown", rawText: text };
}

export function assistantIntentKind(intent: DaaAssistantIntent): DaaChatIntentKind {
  return intent.kind;
}
