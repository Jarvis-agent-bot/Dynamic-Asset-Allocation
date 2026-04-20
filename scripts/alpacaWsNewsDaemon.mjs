#!/usr/bin/env node
/**
 * Alpaca WebSocket News daemon.
 *
 * 职责:
 *  - 连接 wss://stream.data.alpaca.markets/v1beta1/news
 *  - 订阅 US 市场持仓/watchlist symbol（从 daa-web 拉取）
 *  - 收到 news 事件后转发到 daa-web 的 /api/daa/news/realtime-event
 *  - 每 5 分钟 reconcile 订阅列表，持仓变动后自动加/删订阅
 *  - 断线指数退避重连，401/403 立即停止（密钥错误）
 *
 * ENV:
 *  - ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY
 *  - DAA_CRON_TOKEN
 *  - DAA_WEB_BASE_URL (默认 http://daa-web:3000)
 *  - DAA_WS_NEWS_URL (默认 wss://stream.data.alpaca.markets/v1beta1/news)
 *  - DAA_WS_RECONCILE_INTERVAL_MS (默认 300000 = 5min)
 */

import WebSocket from "ws";

const KEY_ID = process.env.ALPACA_API_KEY_ID || "";
const SECRET = process.env.ALPACA_API_SECRET_KEY || "";
const CRON_TOKEN = process.env.DAA_CRON_TOKEN || "";
const WEB_BASE = (process.env.DAA_WEB_BASE_URL || "http://daa-web:3000").replace(/\/+$/, "");
const WS_URL = process.env.DAA_WS_NEWS_URL || "wss://stream.data.alpaca.markets/v1beta1/news";
const RECONCILE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.DAA_WS_RECONCILE_INTERVAL_MS || 300_000) || 300_000,
);

if (!KEY_ID || !SECRET) {
  console.error("[alpaca-ws] missing ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY, exiting");
  process.exit(1);
}
if (!CRON_TOKEN) {
  console.error("[alpaca-ws] missing DAA_CRON_TOKEN, exiting");
  process.exit(1);
}

/** 当前已订阅 symbol 集合（小写化对比） */
let currentSubs = new Set();
let ws = null;
let reconnectDelayMs = 1000;
const MAX_RECONNECT_DELAY = 60_000;
let reconcileTimer = null;
let stopping = false;

function log(...args) {
  console.log("[alpaca-ws]", new Date().toISOString(), ...args);
}

async function fetchSubscribedSymbols() {
  const url = `${WEB_BASE}/api/daa/news/subscribed-symbols`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-daa-cron-token": CRON_TOKEN, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`subscribed-symbols ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const symbols = Array.isArray(body?.data?.symbols) ? body.data.symbols : [];
  return symbols.map((s) => String(s).toUpperCase()).filter(Boolean);
}

async function forwardEvent(event) {
  const url = `${WEB_BASE}/api/daa/news/realtime-event`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-daa-cron-token": CRON_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log(`forward failed status=${res.status} body=${text.slice(0, 200)}`);
    }
  } catch (e) {
    log("forward error:", e?.message || e);
  }
}

function sendSubDiff(target) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const targetSet = new Set(target);
  const toAdd = [...targetSet].filter((s) => !currentSubs.has(s));
  const toRemove = [...currentSubs].filter((s) => !targetSet.has(s));

  if (toAdd.length > 0) {
    ws.send(JSON.stringify({ action: "subscribe", news: toAdd }));
    log("subscribe +", toAdd.join(","));
  }
  if (toRemove.length > 0) {
    ws.send(JSON.stringify({ action: "unsubscribe", news: toRemove }));
    log("unsubscribe -", toRemove.join(","));
  }
  currentSubs = targetSet;
}

async function reconcile() {
  try {
    const target = await fetchSubscribedSymbols();
    // 空订阅列表时用通配 "*"（免费层允许，但会拉全量；谨慎使用）
    // 这里选择：空 → 不订阅；有持仓 → 精确订阅
    if (target.length === 0) {
      if (currentSubs.size > 0 && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "unsubscribe", news: [...currentSubs] }));
        currentSubs = new Set();
      }
      log("no symbols to subscribe");
      return;
    }
    sendSubDiff(target);
  } catch (e) {
    log("reconcile error:", e?.message || e);
  }
}

function handleNewsEvent(msg) {
  const event = {
    id: Number(msg.id),
    headline: String(msg.headline || ""),
    summary: typeof msg.summary === "string" ? msg.summary : undefined,
    author: typeof msg.author === "string" ? msg.author : undefined,
    created_at: String(msg.created_at || new Date().toISOString()),
    updated_at: typeof msg.updated_at === "string" ? msg.updated_at : undefined,
    url: typeof msg.url === "string" ? msg.url : undefined,
    content: typeof msg.content === "string" ? msg.content : undefined,
    symbols: Array.isArray(msg.symbols) ? msg.symbols.map(String) : [],
    source: typeof msg.source === "string" ? msg.source : "benzinga",
  };
  if (!event.id || !event.headline) return;
  log(`news id=${event.id} symbols=${event.symbols.join(",")} headline="${event.headline.slice(0, 80)}"`);
  forwardEvent(event);
}

function handleSocketMessage(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.toString());
  } catch (e) {
    log("parse error:", e?.message || e);
    return;
  }
  if (!Array.isArray(parsed)) return;

  for (const m of parsed) {
    if (!m || typeof m !== "object") continue;
    const t = m.T;
    if (t === "success" && m.msg === "connected") {
      log("connected, authenticating");
      ws.send(JSON.stringify({ action: "auth", key: KEY_ID, secret: SECRET }));
    } else if (t === "success" && m.msg === "authenticated") {
      log("authenticated");
      reconnectDelayMs = 1000;
      currentSubs = new Set();
      reconcile();
    } else if (t === "subscription") {
      log("subscription state:", JSON.stringify(m.news || []));
    } else if (t === "error") {
      log(`error code=${m.code} msg=${m.msg}`);
      if (m.code === 402 || m.code === 404 || m.code === 409) {
        log("fatal auth/subscription error, stopping");
        stopping = true;
        try { ws.close(); } catch {}
        process.exit(2);
      }
    } else if (t === "n") {
      handleNewsEvent(m);
    }
  }
}

function connect() {
  if (stopping) return;
  log("connecting to", WS_URL);
  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    // 认证在 "connected" 成功消息后发
  });

  ws.on("message", handleSocketMessage);

  ws.on("close", (code, reason) => {
    log(`ws close code=${code} reason=${reason?.toString?.() || ""}`);
    currentSubs = new Set();
    if (stopping) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY, reconnectDelayMs * 2);
    log(`reconnect in ${delay}ms`);
    setTimeout(connect, delay);
  });

  ws.on("error", (e) => {
    log("ws error:", e?.message || e);
  });
}

function startReconcileTimer() {
  if (reconcileTimer) clearInterval(reconcileTimer);
  reconcileTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) reconcile();
  }, RECONCILE_INTERVAL_MS);
}

function shutdown(signal) {
  log(`received ${signal}, shutting down`);
  stopping = true;
  if (reconcileTimer) clearInterval(reconcileTimer);
  try { ws?.close(); } catch {}
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => log("unhandledRejection:", e?.message || e));

log(`starting daemon, web=${WEB_BASE} reconcile=${RECONCILE_INTERVAL_MS}ms`);
connect();
startReconcileTimer();
