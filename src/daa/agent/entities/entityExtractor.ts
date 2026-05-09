/**
 * Entity Extractor — 从记忆/论点文本中抽取结构化实体
 *
 * 支持 6 种实体：asset / thesis_id / regime / ticker / news_source / strategy_tag
 * 抽取结果驱动实体图（daa_agent_entity + link tables），用于回答
 * "关于 NVDA 我学到了什么" 这类跨资产因果查询。
 */

import { parseDaaAssetKey } from "@/src/daa/assetKey";

export type EntityKind =
  | "asset"
  | "thesis_id"
  | "regime"
  | "ticker"
  | "news_source"
  | "strategy_tag";

export interface ExtractedEntity {
  kind: EntityKind;
  value: string;
  displayName?: string;
}

// ── 正则常量 ──

const ASSET_KEY_RE = /\b(?:US|HK|CN|EU|JP|GLOBAL|CRYPTO)::[A-Z0-9.\-_]+/g;
const HK_CN_SYMBOL_RE = /\b\d{4,6}\.(?:HK|SS|SZ)\b/g;
// 美股 ticker 粗筛：2-5 个大写字母，避开常见英文单词
const US_TICKER_RE = /\b[A-Z]{2,5}\b/g;
const US_TICKER_STOPWORDS = new Set([
  // 语气/结构词
  "THE","AND","FOR","BUT","WITH","FROM","THIS","THAT","WHAT","WHEN","WHERE",
  "HAVE","HAS","HAD","WILL","WOULD","SHOULD","COULD","CAN","MAY","MIGHT",
  "YES","NO","OK","NOT","ARE","WAS","WERE","BE","BEEN","BEING",
  // 金融术语
  "PE","PB","PS","PEG","EPS","ROE","ROA","ROIC","IPO","ETF","SEC","FED","CPI","PPI","GDP","SME","ESG",
  "BUY","SELL","HOLD","LONG","SHORT","BULL","BEAR",
  "USD","EUR","GBP","JPY","HKD","CNY","RMB","CAD","AUD",
  // 常用缩写
  "API","URL","HTTP","JSON","CSV","SQL","LLM","CEO","CFO","CTO","USA","CHN","AMP",
  "US","HK","CN","EU","JP","UK",
  // Agent/code 语境
  "AI","UI","UX","OS","DB","PG","QA","QC",
]);

// Regime 关键字（中英）
const REGIME_PATTERNS: Array<{ regime: "risk_off" | "risk_on" | "transitional"; rx: RegExp }> = [
  { regime: "risk_off", rx: /\brisk[_\s-]?off\b|避险|防守|risk[\s-]aversion/i },
  { regime: "risk_on", rx: /\brisk[_\s-]?on\b|进攻|追涨|risk[\s-]appetite/i },
  { regime: "transitional", rx: /\btransitional\b|过渡|震荡/i },
];

// 新闻来源关键字
const NEWS_SOURCES: Array<{ value: string; rx: RegExp }> = [
  { value: "reuters", rx: /路透|reuters/i },
  { value: "bloomberg", rx: /彭博|bloomberg/i },
  { value: "wsj", rx: /华尔街日报|wsj|wall street journal/i },
  { value: "ft", rx: /金融时报|financial times\b/i },
  { value: "cnbc", rx: /\bcnbc\b/i },
  { value: "xueqiu", rx: /雪球|xueqiu/i },
  { value: "alpaca", rx: /\balpaca\b/i },
  { value: "benzinga", rx: /\bbenzinga\b/i },
  { value: "finnhub", rx: /\bfinnhub\b/i },
  { value: "yahoo", rx: /yahoo[\s-]?(finance|news)?/i },
  { value: "sec_filing", rx: /sec\s*(filing|文件)|10[-\s]?[KQ]|8[-\s]?K/i },
];

// UUID / threadId 粗筛（UUID v4-ish）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── 公共 API ──

/**
 * 从自由文本中抽取实体（不含上下文信息，纯文本分析）。
 */
export function extractEntitiesFromText(text: string): ExtractedEntity[] {
  if (!text) return [];
  const out = new Map<string, ExtractedEntity>();
  const add = (e: ExtractedEntity) => {
    const key = `${e.kind}::${e.value}`;
    if (!out.has(key)) out.set(key, e);
  };

  // 1. assetKey（MARKET::SYMBOL）
  for (const match of text.matchAll(ASSET_KEY_RE)) {
    const assetKey = match[0];
    const parsed = parseDaaAssetKey(assetKey);
    if (!parsed) continue;
    add({ kind: "asset", value: assetKey });
    const tickerCore = parsed.symbol.split(".")[0].toUpperCase();
    if (tickerCore) add({ kind: "ticker", value: tickerCore });
  }

  // 2. 港 A 股 symbol（4-6 位数字 + 交易所后缀）
  for (const match of text.matchAll(HK_CN_SYMBOL_RE)) {
    const sym = match[0];
    add({ kind: "ticker", value: sym });
  }

  // 3. 美股 ticker（粗筛 + 停用词过滤）
  for (const match of text.matchAll(US_TICKER_RE)) {
    const raw = match[0];
    if (US_TICKER_STOPWORDS.has(raw)) continue;
    // 已作为 assetKey 一部分抽出的 ticker 不重复
    add({ kind: "ticker", value: raw });
  }

  // 4. Regime
  for (const p of REGIME_PATTERNS) {
    if (p.rx.test(text)) add({ kind: "regime", value: p.regime });
  }

  // 5. News source
  for (const s of NEWS_SOURCES) {
    if (s.rx.test(text)) add({ kind: "news_source", value: s.value });
  }

  return Array.from(out.values());
}

/**
 * 从 relevanceTags 数组中抽取 thesis_id / strategy_tag 实体。
 * - UUID 形式 → thesis_id
 * - 其它 → strategy_tag
 */
export function extractEntitiesFromTags(tags: string[]): ExtractedEntity[] {
  const out: ExtractedEntity[] = [];
  for (const t of tags ?? []) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    if (UUID_RE.test(trimmed)) {
      out.push({ kind: "thesis_id", value: trimmed });
    } else {
      out.push({ kind: "strategy_tag", value: trimmed });
    }
  }
  return out;
}

/**
 * 为一条记忆抽取完整实体集（content + relevanceTags + 可选所属 thesis）。
 */
export function extractEntitiesFromMemory(input: {
  content: string;
  relevanceTags?: string[];
  thread?: { id: string; assetKeys?: string[]; tags?: string[] };
}): ExtractedEntity[] {
  const merged = new Map<string, ExtractedEntity>();
  const add = (e: ExtractedEntity) => {
    const key = `${e.kind}::${e.value}`;
    if (!merged.has(key)) merged.set(key, e);
  };

  for (const e of extractEntitiesFromText(input.content)) add(e);
  for (const e of extractEntitiesFromTags(input.relevanceTags ?? [])) add(e);

  if (input.thread) {
    add({ kind: "thesis_id", value: input.thread.id });
    for (const key of input.thread.assetKeys ?? []) {
      const parsed = parseDaaAssetKey(key);
      if (!parsed) continue;
      add({ kind: "asset", value: key });
      const tickerCore = parsed.symbol.split(".")[0].toUpperCase();
      if (tickerCore) add({ kind: "ticker", value: tickerCore });
    }
    for (const e of extractEntitiesFromTags(input.thread.tags ?? [])) add(e);
  }

  return Array.from(merged.values());
}

/**
 * 为一个论点抽取实体（title + thesisText + assetKeys + tags）。
 */
export function extractEntitiesFromThesis(thread: {
  id: string;
  title: string;
  thesisText: string;
  assetKeys: string[];
  tags: string[];
}): ExtractedEntity[] {
  const merged = new Map<string, ExtractedEntity>();
  const add = (e: ExtractedEntity) => {
    const key = `${e.kind}::${e.value}`;
    if (!merged.has(key)) merged.set(key, e);
  };

  // 论点自身也是一个 thesis_id 实体
  add({ kind: "thesis_id", value: thread.id });

  for (const key of thread.assetKeys ?? []) {
    const parsed = parseDaaAssetKey(key);
    if (!parsed) continue;
    add({ kind: "asset", value: key });
    const tickerCore = parsed.symbol.split(".")[0].toUpperCase();
    if (tickerCore) add({ kind: "ticker", value: tickerCore });
  }

  for (const e of extractEntitiesFromText(`${thread.title}\n${thread.thesisText}`)) add(e);
  for (const e of extractEntitiesFromTags(thread.tags ?? [])) add(e);

  return Array.from(merged.values());
}
