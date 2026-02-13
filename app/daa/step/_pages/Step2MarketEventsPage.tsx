"use client";

import { useEffect, useMemo, useState } from "react";

import { filterMarketEvents, type MarketEvent, type MarketEventSource } from "../../../../src/core/marketEvents";
import {
  mergeMarketEvents,
  normalizeTwitterInput,
  normalizeXueqiuNewsInput,
  normalizeYahooFinanceNewsInput,
} from "../../../../src/market/normalize";

import { LS_MARKET_EVENTS, pretty, readJsonFromLs, saveJsonToLs, WIZARD_DATA_EVENT } from "../../wizardStorage";
import { getAllowedValueKeySetForAppliesTo, loadTagTaxonomy } from "../../tagTaxonomy";
import { useMarketDataClient } from "../../useMarketDataClient";

function fmtTs(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || "");
  return d.toLocaleString("zh-CN", { hour12: false });
}

const SAMPLE_TWITTER_JSON = pretty([
  {
    id: "1870000000000000000",
    created_at: "2026-02-10T08:30:00.000Z",
    text: "Macro: CPI print looks softer than expected. $SPY $QQQ\nAnalyst view: risk-on may persist.",
    author: "@analyst_list",
    url: "https://twitter.com/",
    tags: ["macro", "rates"],
  },
]);

const SAMPLE_YFINANCE_JSON = pretty([
  {
    uuid: "yf-1",
    title: "Company earnings beat estimates",
    link: "https://finance.yahoo.com/",
    providerPublishTime: 1765414200,
    relatedTickers: ["AAPL"],
    summary: "Objective news example from yfinance export.",
  },
]);

const SAMPLE_XUEQIU_JSON = pretty({
  items: [
    {
      id: "xq-1",
      created_at: 1765417800,
      title: "雪球：市场快讯",
      summary: "示例：可粘贴雪球 API/抓取导出的 JSON。",
      symbols: ["SH600519"],
      url: "https://xueqiu.com/",
    },
  ],
});

const DEFAULT_EVENTS: MarketEvent[] = [
  {
    id: "tw-sample",
    source: "twitter",
    ts: "2026-02-06T08:30:00.000Z",
    title: "Macro: CPI print looks softer than expected",
    summary: "Analyst view: risk-on may persist if follow-through continues.",
    symbols: ["SPY", "QQQ"],
    author: "@analyst_list",
    tags: ["macro", "rates"],
    url: "https://twitter.com",
  },
  {
    id: "news-sample",
    source: "news",
    ts: "2026-02-06T06:10:00.000Z",
    title: "Company earnings beat estimates",
    summary: "Objective news stub. Later: yfinance/xueqiu ingestion.",
    symbols: ["AAPL"],
    tags: ["earnings"],
    url: "https://finance.yahoo.com",
  },
];

export default function Step2MarketEventsPage() {
  const marketData = useMarketDataClient();

  const [events, setEvents] = useState<MarketEvent[]>(DEFAULT_EVENTS);
  const [selected, setSelected] = useState<MarketEvent | null>(null);

  const [showTwitter, setShowTwitter] = useState(true);
  const [showNews, setShowNews] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [since, setSince] = useState(""); // YYYY-MM-DD
  const [until, setUntil] = useState(""); // YYYY-MM-DD

  const [twitterText, setTwitterText] = useState("");
  const [yfinanceText, setYfinanceText] = useState("");
  const [xueqiuText, setXueqiuText] = useState("");
  const [ingestIssues, setIngestIssues] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<string>("");

  const [twitterListId, setTwitterListId] = useState("1898757620019908725");
  const [twitterListLimit, setTwitterListLimit] = useState(50);
  const [twitterCommunityId, setTwitterCommunityId] = useState("");
  const [twitterCommunityCursor, setTwitterCommunityCursor] = useState("");
  const [twitterCommunityLimit, setTwitterCommunityLimit] = useState(50);

  const [twitterUserScreenName, setTwitterUserScreenName] = useState("limichange2");
  const [twitterUserRestId, setTwitterUserRestId] = useState("");
  const [twitterUserCursor, setTwitterUserCursor] = useState("");
  const [twitterUserLimit, setTwitterUserLimit] = useState(50);

  const [twitterSearchQuery, setTwitterSearchQuery] = useState("ai");
  const [twitterSearchCursor, setTwitterSearchCursor] = useState("");
  const [twitterSearchLimit, setTwitterSearchLimit] = useState(50);

  const [yahooSymbol, setYahooSymbol] = useState("AAPL");
  const [xueqiuSymbol, setXueqiuSymbol] = useState("SH603533");
  const [fetchState, setFetchState] = useState<string>("");

  const [taxonomyRefresh, setTaxonomyRefresh] = useState(0);
  const [tagToAdd, setTagToAdd] = useState<string>("");
  const [tagIssues, setTagIssues] = useState<string[]>([]);

  useEffect(() => {
    const onData = () => setTaxonomyRefresh((x) => x + 1);
    window.addEventListener(WIZARD_DATA_EVENT, onData);
    return () => window.removeEventListener(WIZARD_DATA_EVENT, onData);
  }, []);

  const tagTaxonomy = useMemo(() => loadTagTaxonomy(), [taxonomyRefresh]);
  const allowedEventTagSet = useMemo(() => getAllowedValueKeySetForAppliesTo(tagTaxonomy, "marketEvent"), [tagTaxonomy]);
  const allowedEventTags = useMemo(() => [...allowedEventTagSet].sort(), [allowedEventTagSet]);

  useEffect(() => {
    const stored = readJsonFromLs<MarketEvent[]>(LS_MARKET_EVENTS);
    if (stored && Array.isArray(stored) && stored.length) {
      setEvents(stored);
    }
  }, []);

  useEffect(() => {
    saveJsonToLs(LS_MARKET_EVENTS, events);
  }, [events]);

  const filtered = useMemo(() => {
    const sources: MarketEventSource[] = [];
    if (showTwitter) sources.push("twitter");
    if (showNews) sources.push("news");

    const sinceTs = since ? `${since}T00:00:00.000Z` : undefined;
    const untilTs = until ? `${until}T23:59:59.999Z` : undefined;

    return filterMarketEvents(events, {
      sources,
      symbols: symbol.trim() ? [symbol.trim()] : undefined,
      sinceTs,
      untilTs,
      limit: 500,
    });
  }, [events, showTwitter, showNews, symbol, since, until]);

  const selectedUnknownTags = useMemo(() => {
    if (!selected || !allowedEventTagSet.size) return [];
    const out: string[] = [];
    for (const t of selected.tags || []) {
      const k = String(t || "").trim();
      if (!k) continue;
      if (!allowedEventTagSet.has(k)) out.push(k);
    }
    return out;
  }, [selected, allowedEventTagSet]);

  function ingest() {
    const issues: string[] = [];
    const added: MarketEvent[] = [];

    if (twitterText.trim()) {
      const r = normalizeTwitterInput(twitterText, {});
      issues.push(...r.issues.map((x) => `twitter: ${x}`));
      added.push(...r.events);
    }

    if (yfinanceText.trim()) {
      const r = normalizeYahooFinanceNewsInput(yfinanceText);
      issues.push(...r.issues.map((x) => `yfinance: ${x}`));
      added.push(...r.events);
    }

    if (xueqiuText.trim()) {
      const r = normalizeXueqiuNewsInput(xueqiuText);
      issues.push(...r.issues.map((x) => `xueqiu: ${x}`));
      added.push(...r.events);
    }

    if (!added.length) {
      issues.push("no events produced (check your JSON/text)");
      setIngestIssues(issues);
      return;
    }

    setEvents((prev) => mergeMarketEvents(prev, added));
    setIngestIssues(issues);
    setTagIssues([]);
  }

  function safeParseJsonArray(text: string): any[] {
    try {
      const v = JSON.parse(text);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function mergeLooseTweetItems(prev: any[], added: any[]): any[] {
    const out: any[] = [];
    const seen = new Set<string>();

    const push = (it: any) => {
      const id = String(it?.id ?? "").trim();
      const createdAt = String(it?.created_at ?? it?.createdAt ?? "").trim();
      const text = String(it?.text ?? it?.full_text ?? it?.content ?? "").trim();
      const key = id || (createdAt && text ? `${createdAt}::${text}` : text);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(it);
    };

    prev.forEach(push);
    added.forEach(push);
    return out;
  }

  function collectTwitterdataInstructionArrays(payload: any): any[][] {
    const out: any[][] = [];
    const seen = new Set<any>();

    const walk = (node: any, depth: number) => {
      if (!node || depth > 10) return;
      if (Array.isArray(node)) return;
      if (typeof node !== "object") return;

      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "instructions" && Array.isArray(v)) {
          if (!seen.has(v)) {
            seen.add(v);
            out.push(v);
          }
          continue;
        }

        if (v && typeof v === "object" && !Array.isArray(v)) {
          walk(v, depth + 1);
        }
      }
    };

    walk(payload, 0);
    return out;
  }

  function extractCursor(payload: any): string {
    const c =
      payload?.nextCursor ??
      payload?.next_cursor ??
      payload?.cursor ??
      payload?.next?.cursor ??
      payload?.data?.next_cursor ??
      payload?.data?.cursor;
    if (typeof c === "string" && c.trim()) return c.trim();

    // twitterdata often encodes cursors as special timeline entries.
    for (const instArr of collectTwitterdataInstructionArrays(payload)) {
      for (const inst of instArr) {
        const entries = inst?.entries;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          const content = e?.content ?? {};
          const cursorType = content?.cursorType;
          const value = content?.value;
          if (cursorType === "Bottom" && typeof value === "string" && value.trim()) return value.trim();
        }
      }
    }

    return "";
  }

  function extractTwitterdataRestId(payload: any): string {
    const direct =
      payload?.data?.user?.result?.rest_id ??
      payload?.data?.userResults?.result?.rest_id ??
      payload?.data?.user?.rest_id ??
      payload?.rest_id;

    if (typeof direct === "string" && /^\d+$/.test(direct.trim())) return direct.trim();

    let found = "";

    const walk = (node: any, depth: number) => {
      if (found) return;
      if (!node || depth > 10) return;
      if (Array.isArray(node)) return;
      if (typeof node !== "object") return;

      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "rest_id" && typeof v === "string" && /^\d+$/.test(v.trim())) {
          found = v.trim();
          return;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) walk(v, depth + 1);
      }
    };

    walk(payload, 0);
    return found;
  }

  // twitterdata returns GraphQL-ish nested timelines; we extract tweet results into a stable array
  // that our `normalizeTwitterInput()` can digest.
  function extractTwitterdataTweets(payload: any): any[] {
    const out: any[] = [];

    const addTweet = (tweet: any) => {
      const restId = String(tweet?.rest_id ?? tweet?.id_str ?? tweet?.legacy?.id_str ?? "").trim();
      const legacy = tweet?.legacy ?? {};
      const userLegacy = tweet?.core?.user_results?.result?.legacy ?? tweet?.core?.user_results?.result ?? {};
      const screenName = String(userLegacy?.screen_name ?? "").trim();

      const text = String(legacy?.full_text ?? legacy?.text ?? "").trim();
      const createdAt = String(legacy?.created_at ?? "").trim();

      const author = screenName ? `@${screenName}` : undefined;
      const url = screenName && restId ? `https://x.com/${screenName}/status/${restId}` : undefined;

      if (!text) return;

      out.push({
        id: restId || undefined,
        created_at: createdAt || undefined,
        text,
        author,
        url,
      });
    };

    const addEntry = (entry: any) => {
      const content = entry?.content ?? entry;

      // Common shape: { itemContent: { tweet_results: { result: Tweet } } }
      const tweet1 = content?.itemContent?.tweet_results?.result;
      if (tweet1) addTweet(tweet1);

      // Module shape: { items: [ { item: { itemContent: ... } }, ... ] }
      const items = content?.items;
      if (Array.isArray(items)) {
        for (const it of items) {
          const tweet2 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
          if (tweet2) addTweet(tweet2);
        }
      }

      // Conversation/module shape: { items: [ { item: { itemContent: ... } } ] } nested under content
      const modItems = content?.content?.items;
      if (Array.isArray(modItems)) {
        for (const it of modItems) {
          const tweet3 = it?.item?.itemContent?.tweet_results?.result ?? it?.itemContent?.tweet_results?.result;
          if (tweet3) addTweet(tweet3);
        }
      }
    };

    const addInstructions = (instructions: any) => {
      if (!Array.isArray(instructions)) return;
      for (const inst of instructions) {
        const entries = inst?.entries;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) addEntry(e);
      }
    };

    for (const instArr of collectTwitterdataInstructionArrays(payload)) {
      addInstructions(instArr);
    }

    return out;
  }

  async function fetchTwitterList() {
    setFetchState("fetching twitter list...");
    try {
      const j = (await marketData.twitter.list({ listId: twitterListId, limit: twitterListLimit })) as any;

      // Convert twitterdata's nested timeline payload into a stable JSON array.
      const payload = j?.payload;
      const normalized = extractTwitterdataTweets(payload);
      const ingestR = normalizeTwitterInput(JSON.stringify(normalized), {});
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `twitter: ${x}`));
      setTagIssues([]);


      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(`twitter list fetched: ${normalized.length} -> ${ingestR.events.length} events (auto-ingested)`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter list fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchTwitterCommunity(opts?: { reset?: boolean }) {
    const reset = Boolean(opts?.reset);
    const communityId = twitterCommunityId.trim();
    if (!communityId) {
      setFetchState("twitter community fetch failed: missing communityId");
      return;
    }

    const cursor = reset ? "" : twitterCommunityCursor.trim();
    setFetchState(reset ? "fetching twitter community (first page)..." : "fetching twitter community (next page)...");

    try {
      const j = (await marketData.twitter.community({
        communityId,
        cursor: cursor || undefined,
        limit: twitterCommunityLimit,
      })) as any;

      const payload = j?.payload;
      const nextCursor = extractCursor(payload);
      if (nextCursor) setTwitterCommunityCursor(nextCursor);

      const normalized = extractTwitterdataTweets(payload);
      const ingestR = normalizeTwitterInput(JSON.stringify(normalized), {});
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `twitter: ${x}`));
      setTagIssues([]);


      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(reset ? [] : prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(`twitter community fetched: ${normalized.length} -> ${ingestR.events.length} events${nextCursor ? " (cursor updated)" : ""}`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter community fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchTwitterUserByScreenName() {
    const screenName = twitterUserScreenName.trim().replace(/^@/, "");
    if (!screenName) {
      setFetchState("twitter user resolve failed: missing screenName");
      return;
    }

    setFetchState("resolving twitter user restId...");
    try {
      const j = (await marketData.twitter.userByScreenName({ screenName })) as any;

      const restId = extractTwitterdataRestId(j?.payload);
      if (restId) setTwitterUserRestId(restId);

      setFetchState(restId ? `twitter user resolved: restId=${restId}` : "twitter user resolved (restId not found)");
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter user resolve failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchTwitterUserTweets(opts?: { reset?: boolean; includeReplies?: boolean }) {
    const reset = Boolean(opts?.reset);
    const includeReplies = Boolean(opts?.includeReplies);

    const restId = twitterUserRestId.trim();
    if (!restId) {
      setFetchState("twitter user tweets fetch failed: missing restId (resolve by screenName first)");
      return;
    }

    const cursor = reset ? "" : twitterUserCursor.trim();
    setFetchState(reset ? "fetching twitter user tweets (first page)..." : "fetching twitter user tweets (next page)...");

    try {
      const j = (await marketData.twitter.userTweets({
        restId,
        includeReplies,
        cursor: cursor || undefined,
        limit: twitterUserLimit,
      })) as any;

      const payload = j?.payload;
      const nextCursor = extractCursor(payload);
      if (nextCursor) setTwitterUserCursor(nextCursor);

      const normalized = extractTwitterdataTweets(payload);
      const ingestR = normalizeTwitterInput(JSON.stringify(normalized), {});
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `twitter: ${x}`));
      setTagIssues([]);

      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(reset ? [] : prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(
        `twitter user ${includeReplies ? "tweets+replies" : "tweets"} fetched: ${normalized.length} -> ${ingestR.events.length} events${nextCursor ? " (cursor updated)" : ""}`,
      );
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter user tweets fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchTwitterSearch(opts?: { reset?: boolean }) {
    const reset = Boolean(opts?.reset);
    const rawQuery = twitterSearchQuery.trim();
    if (!rawQuery) {
      setFetchState("twitter search failed: missing query");
      return;
    }

    const cursor = reset ? "" : twitterSearchCursor.trim();
    setFetchState(reset ? "searching twitter (first page)..." : "searching twitter (next page)...");

    try {
      const j = (await marketData.twitter.search({
        rawQuery,
        cursor: cursor || undefined,
        limit: twitterSearchLimit,
      })) as any;

      const payload = j?.payload;
      const nextCursor = extractCursor(payload);
      if (nextCursor) setTwitterSearchCursor(nextCursor);

      const normalized = extractTwitterdataTweets(payload);
      const ingestR = normalizeTwitterInput(JSON.stringify(normalized), {});
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `twitter: ${x}`));
      setTagIssues([]);

      setTwitterText((prev) => {
        const prevArr = safeParseJsonArray(prev);
        const merged = mergeLooseTweetItems(reset ? [] : prevArr, normalized);
        return pretty(merged);
      });

      setFetchState(`twitter search fetched: ${normalized.length} -> ${ingestR.events.length} events${nextCursor ? " (cursor updated)" : ""}`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`twitter search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchYahooRss() {
    setFetchState("fetching yahoo rss...");
    try {
      const j = (await marketData.yahoo.rss({ symbol: yahooSymbol })) as any;

      // Normalize into a yfinance-like array.
      const arr = (j?.items ?? []).map((it: any, idx: number) => {
        return {
          uuid: `yahoo-rss-${j?.symbol ?? yahooSymbol}-${idx}`,
          title: it?.title,
          link: it?.link,
          providerPublishTime: it?.pubDate,
          relatedTickers: [String(j?.symbol ?? yahooSymbol).toUpperCase()],
          summary: it?.summary,
        };
      });
      const ingestR = normalizeYahooFinanceNewsInput(JSON.stringify(arr));
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `yfinance: ${x}`));
      setTagIssues([]);


      setYfinanceText(pretty(arr));
      setFetchState(`yahoo rss fetched: ${arr.length} -> ${ingestR.events.length} events (auto-ingested)`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`yahoo rss fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function fetchXueqiuQuote() {
    setFetchState("fetching xueqiu quote...");
    try {
      const j = (await marketData.xueqiu.quoteC({ symbol: xueqiuSymbol })) as any;

      // Wrap it into a news-like shape so it can be ingested into MarketEvent[]
      const quote = j?.payload?.data?.[0] ?? j?.payload?.data?.quote ?? j?.payload?.data ?? j?.payload;
      const now = new Date().toISOString();
      const wrapped = {
        items: [
          {
            id: `xq-quote-${xueqiuSymbol}-${Date.now()}`,
            created_at: now,
            title: `雪球行情 ${xueqiuSymbol}`,
            summary: JSON.stringify(quote)?.slice(0, 800) ?? "",
            symbols: [xueqiuSymbol],
            url: `https://xueqiu.com/S/${xueqiuSymbol}`,
            quote,
          },
        ],
      };
      const ingestR = normalizeXueqiuNewsInput(JSON.stringify(wrapped));
      if (ingestR.events.length) setEvents((prev) => mergeMarketEvents(prev, ingestR.events));
      setIngestIssues(ingestR.issues.map((x) => `xueqiu: ${x}`));
      setTagIssues([]);


      setXueqiuText(pretty(wrapped));
      setFetchState(`xueqiu quote fetched: 1 -> ${ingestR.events.length} events (auto-ingested)`);
      window.setTimeout(() => setFetchState(""), 1200);
    } catch (e) {
      setFetchState(`xueqiu quote fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function updateEventById(id: string, updater: (e: MarketEvent) => MarketEvent) {
    setEvents((prev) => prev.map((e) => (e.id === id ? updater(e) : e)));
    setSelected((prev) => (prev && prev.id === id ? updater(prev) : prev));
    setTagIssues([]);
  }

  function validateAllEventTags(list: MarketEvent[]): string[] {
    if (!allowedEventTagSet.size) return [];

    const issues: string[] = [];
    for (const e of list) {
      for (const t of e.tags || []) {
        const k = String(t || "").trim();
        if (!k) continue;
        if (!allowedEventTagSet.has(k)) issues.push(`event ${e.id}: unknown tag '${k}' (not in Step7 taxonomy)`);
      }
    }

    return issues;
  }

  function toggleSelectedTag(tag: string) {
    if (!selected) return;
    const k = String(tag || "").trim();
    if (!k) return;

    updateEventById(selected.id, (e) => {
      const set = new Set<string>((e.tags || []).map((x) => String(x || "").trim()).filter(Boolean));
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return { ...e, tags: [...set] };
    });
  }

  function addTagFromDropdown() {
    if (!selected) return;
    const k = String(tagToAdd || "").trim();
    if (!k) return;

    if (!allowedEventTagSet.size) {
      setTagIssues(["no marketEvent tags found in Step7 taxonomy; configure Step7 first"]);
      return;
    }

    if (!allowedEventTagSet.has(k)) {
      setTagIssues([`tag '${k}' is not in Step7 taxonomy`]);
      return;
    }

    toggleSelectedTag(k);
    setTagToAdd("");
  }

  function copyAllJson() {
    const issues = validateAllEventTags(filtered);
    setTagIssues(issues);
    if (issues.length) return;

    const payload = {
      generatedAt: new Date().toISOString(),
      events: filtered,
    };

    navigator.clipboard.writeText(pretty(payload));
    setCopyState(`copied ${filtered.length} events`);
    window.setTimeout(() => setCopyState(""), 1200);
  }

  function copySelectedJson() {
    if (!selected) return;

    const issues = validateAllEventTags([selected]);
    setTagIssues(issues);
    if (issues.length) return;

    navigator.clipboard.writeText(pretty(selected));
    setCopyState("copied selected event");
    window.setTimeout(() => setCopyState(""), 1200);
  }

  function copyTwitterJson() {
    const arr = safeParseJsonArray(twitterText);
    const text = arr.length ? pretty(arr) : twitterText;

    navigator.clipboard.writeText(text);
    setCopyState(arr.length ? `copied twitter json (${arr.length} items)` : "copied twitter text");
    window.setTimeout(() => setCopyState(""), 1200);
  }

  return (
    <main>
      <h1 style={{ margin: 0, fontSize: 20 }}>Step 2 — 市场信息</h1>
      <p style={{ color: "#444" }}>
        v0：支持把 Twitter（主观）与 yfinance/雪球（客观新闻）标准化为统一 <code>MarketEvent</code> JSON，并在页面里过滤/查看/复制。
      </p>

      <section style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>Ingest / Fetch（自动拉取 → 标准化 → 合并到事件列表）</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={ingest} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
              Ingest
            </button>
            <button
              onClick={() => {
                setTwitterText(SAMPLE_TWITTER_JSON);
                setYfinanceText(SAMPLE_YFINANCE_JSON);
                setXueqiuText(SAMPLE_XUEQIU_JSON);
                setIngestIssues([]);
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Load samples
            </button>
            <button
              onClick={() => {
                setTwitterText("");
                setYfinanceText("");
                setXueqiuText("");
                setIngestIssues([]);
              }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10, borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#666" }}>
              自动拉取（token 仅在服务端 env）：<code>TWITTERDATA_TOKEN</code> / <code>XUEQIU_TOKEN</code>
            </div>
            {fetchState ? <span style={{ fontSize: 12, color: "#666" }}>{fetchState}</span> : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterListId} onChange={(e) => setTwitterListId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Twitter listId" />
            <input
              type="number"
              value={twitterListLimit}
              onChange={(e) => setTwitterListLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
            <button onClick={fetchTwitterList} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch List
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterCommunityId} onChange={(e) => setTwitterCommunityId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Twitter communityId" />
            <button onClick={() => fetchTwitterCommunity({ reset: true })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Community
            </button>
            <button
              onClick={() => fetchTwitterCommunity({ reset: false })}
              disabled={!twitterCommunityCursor.trim()}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", opacity: twitterCommunityCursor.trim() ? 1 : 0.5 }}
              title={twitterCommunityCursor.trim() ? "" : "No cursor yet (fetch first page)"}
            >
              Next page
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterCommunityCursor} onChange={(e) => setTwitterCommunityCursor(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Community cursor (auto-filled)" />
            <input
              type="number"
              value={twitterCommunityLimit}
              onChange={(e) => setTwitterCommunityLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterUserScreenName} onChange={(e) => setTwitterUserScreenName(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Twitter screenName (e.g. limichange2)" />
            <input value={twitterUserRestId} onChange={(e) => setTwitterUserRestId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="User restId (digits)" />
            <button onClick={fetchTwitterUserByScreenName} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Resolve RestId
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 240px", gap: 8, alignItems: "center" }}>
            <input value={twitterUserRestId} onChange={(e) => setTwitterUserRestId(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="User restId" />
            <input
              type="number"
              value={twitterUserLimit}
              onChange={(e) => setTwitterUserLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => fetchTwitterUserTweets({ reset: true, includeReplies: false })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
                User Tweets
              </button>
              <button onClick={() => fetchTwitterUserTweets({ reset: true, includeReplies: true })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
                Tweets+Replies
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterUserCursor} onChange={(e) => setTwitterUserCursor(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="User cursor (auto-filled)" />
            <button
              onClick={() => setTwitterUserCursor("")}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
              title="Reset cursor"
            >
              Reset
            </button>
            <button
              onClick={() => fetchTwitterUserTweets({ reset: false, includeReplies: false })}
              disabled={!twitterUserCursor.trim()}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", opacity: twitterUserCursor.trim() ? 1 : 0.5 }}
              title={twitterUserCursor.trim() ? "" : "No cursor yet (fetch first page)"}
            >
              Next page
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterSearchQuery} onChange={(e) => setTwitterSearchQuery(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Search query (rawQuery)" />
            <input
              type="number"
              value={twitterSearchLimit}
              onChange={(e) => setTwitterSearchLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }}
              placeholder="limit"
              min={1}
              max={200}
            />
            <button onClick={() => fetchTwitterSearch({ reset: true })} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Search
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 8, alignItems: "center" }}>
            <input value={twitterSearchCursor} onChange={(e) => setTwitterSearchCursor(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Search cursor (auto-filled)" />
            <button
              onClick={() => setTwitterSearchCursor("")}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
              title="Reset cursor"
            >
              Reset
            </button>
            <button
              onClick={() => fetchTwitterSearch({ reset: false })}
              disabled={!twitterSearchCursor.trim()}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff", opacity: twitterSearchCursor.trim() ? 1 : 0.5 }}
              title={twitterSearchCursor.trim() ? "" : "No cursor yet (search first page)"}
            >
              Next page
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={yahooSymbol} onChange={(e) => setYahooSymbol(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Yahoo symbol (AAPL)" />
            <button onClick={fetchYahooRss} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Yahoo RSS
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8, alignItems: "center" }}>
            <input value={xueqiuSymbol} onChange={(e) => setXueqiuSymbol(e.target.value)} style={{ padding: 8, borderRadius: 10, border: "1px solid #eee" }} placeholder="Xueqiu symbol (SH603533)" />
            <button onClick={fetchXueqiuQuote} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}>
              Fetch Xueqiu Quote
            </button>
          </div>
        </div>

        <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: "#666" }}>Twitter（主观）— 支持 JSON array 或纯文本（每行一条）</label>
              <button
                onClick={copyTwitterJson}
                style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
                title="Copy the current Twitter textarea content (prefer JSON array)"
              >
                Copy Twitter JSON
              </button>
            </div>
            <textarea
              value={twitterText}
              onChange={(e) => setTwitterText(e.target.value)}
              placeholder="Paste Twitter list export JSON or plaintext..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>yfinance（客观）— 建议粘贴 Python 导出的 <code>list[dict]</code></label>
            <textarea
              value={yfinanceText}
              onChange={(e) => setYfinanceText(e.target.value)}
              placeholder="Paste yfinance news JSON..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: "#666" }}>雪球（客观）— 支持 <code>{"{items: [...] }"}</code> / <code>{"{list: [...] }"}</code> / array</label>
            <textarea
              value={xueqiuText}
              onChange={(e) => setXueqiuText(e.target.value)}
              placeholder="Paste xueqiu news JSON..."
              style={{ width: "100%", minHeight: 120, padding: 10, borderRadius: 10, border: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 12 }}
            />
          </div>

          {ingestIssues.length ? (
            <div style={{ padding: 10, borderRadius: 10, border: "1px solid #fee2e2", background: "#fff1f2", color: "#991b1b", fontSize: 12 }}>
              {ingestIssues.map((x, i) => (
                <div key={i}>{x}</div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showTwitter} onChange={(e) => setShowTwitter(e.target.checked)} />
          <span>Twitter（主观）</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showNews} onChange={(e) => setShowNews(e.target.checked)} />
          <span>News（客观）</span>
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="SPY"
            aria-label="Filter by symbol"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        {symbol.trim() ? (
          <button
            onClick={() => setSymbol("")}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
          >
            Clear
          </button>
        ) : null}

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Since</span>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            aria-label="Filter since date"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Until</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label="Filter until date"
            style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          />
        </label>
        {(since || until) ? (
          <button
            onClick={() => {
              setSince("");
              setUntil("");
            }}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
          >
            Clear dates
          </button>
        ) : null}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#666" }}>{filtered.length} events</div>
          <button onClick={copyAllJson} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}>
            Copy events JSON
          </button>
          {tagIssues.length ? (
            <div
              style={{ fontSize: 12, color: "#991b1b", maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={tagIssues.join("\n")}
            >
              {tagIssues[0]}
              {tagIssues.length > 1 ? ` (+${tagIssues.length - 1} more)` : ""}
            </div>
          ) : null}
          {copyState ? <div style={{ fontSize: 12, color: "#16a34a" }}>{copyState}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 12 }}>
        <section style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #eee", background: "#fafafa", fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>Events</div>
            <button
              onClick={() => {
                setEvents([]);
                setSelected(null);
              }}
              style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
            >
              Reset
            </button>
          </div>
          <div style={{ padding: 10 }}>
            {filtered.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #eee",
                  background: selected?.id === e.id ? "#f4f7ff" : "#fff",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{e.source}</div>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{e.summary || ""}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#777",
                    marginTop: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    {(e.symbols || []).join(", ")}
                    {e.author ? <span style={{ marginLeft: 8, color: "#666" }}>{e.author}</span> : null}
                    {e.tags?.length ? <span style={{ marginLeft: 8, color: "#666" }}>{e.tags.join(" · ")}</span> : null}
                  </div>
                  <div>{fmtTs(e.ts)}</div>
                </div>
              </button>
            ))}

            {filtered.length === 0 ? <div style={{ color: "#666" }}>No events.</div> : null}
          </div>
        </section>

        {selected ? (
          <section style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                padding: 10,
                borderBottom: "1px solid #eee",
                background: "#fafafa",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>Detail</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{selected.title}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {selected.url ? (
                  <a href={selected.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#2563eb" }}>
                    Open
                  </a>
                ) : null}
                <button
                  onClick={copySelectedJson}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
                >
                  Copy JSON
                </button>
                <button
                  onClick={() => setSelected(null)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>Tags (from Step7 taxonomy)</div>

                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={tagToAdd}
                    onChange={(e) => setTagToAdd(e.target.value)}
                    style={{ padding: 8, border: "1px solid #eee", borderRadius: 8, background: "#fff", minWidth: 220, fontSize: 12 }}
                    disabled={!allowedEventTags.length}
                  >
                    <option value="">{allowedEventTags.length ? "Add a tag..." : "No marketEvent tags (configure Step7)"}</option>
                    {allowedEventTags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addTagFromDropdown}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
                    disabled={!tagToAdd}
                  >
                    Add
                  </button>
                  <button
                    onClick={() => updateEventById(selected.id, (e) => ({ ...e, tags: [] }))}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 12 }}
                    disabled={!(selected.tags || []).length}
                  >
                    Clear tags
                  </button>
                </div>

                {allowedEventTags.length ? (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {allowedEventTags.map((t) => {
                      const active = (selected.tags || []).includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleSelectedTag(t)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: "1px solid #ddd",
                            background: active ? "#111827" : "#fff",
                            color: active ? "#fff" : "#111827",
                            fontSize: 12,
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>去 Step7 配置 taxonomy 里的 marketEvent tags，这里会自动读取并用于校验。</div>
                )}

                {(selected.tags || []).length ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#444" }}>
                    current: <code>{(selected.tags || []).join(", ")}</code>
                  </div>
                ) : null}

                {selectedUnknownTags.length ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#991b1b" }}>
                    unknown tags (not in Step7 taxonomy): <code>{selectedUnknownTags.join(", ")}</code>
                  </div>
                ) : null}
              </div>

              <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(selected)}</pre>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
