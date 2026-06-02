export type YahooRealtimePriceUpdate = {
  symbol: string;
  price: number;
  ts: string;
  currency: string;
  change?: number;
  changePercent?: number;
  dayVolume?: number;
  dayHigh?: number;
  dayLow?: number;
  openPrice?: number;
  previousClose?: number;
  source: "yahoo_streamer";
};

type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  on(event: "open" | "close" | "error" | "message", listener: (...args: unknown[]) => void): void;
};

type WebSocketConstructor = {
  new (url: string): WebSocketLike;
  OPEN: number;
};

type Subscriber = (update: YahooRealtimePriceUpdate) => void;

const YAHOO_STREAMER_URL = "wss://streamer.finance.yahoo.com/?version=2";
const SUBSCRIPTION_HEARTBEAT_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

let singletonHub: YahooRealtimeQuoteHub | null = null;

function readJsonEnvelope(message: string | Buffer): { message?: unknown } | null {
  try {
    const text = Buffer.isBuffer(message) ? message.toString("utf8") : String(message);
    const json = JSON.parse(text);
    return json && typeof json === "object" && !Array.isArray(json) ? json as { message?: unknown } : null;
  } catch {
    return null;
  }
}

function readVarint(bytes: Buffer, offset: number): { value: bigint; next: number } | null {
  let shift = 0n;
  let value = 0n;
  let cursor = offset;

  while (cursor < bytes.length) {
    const byte = bytes[cursor];
    value |= BigInt(byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) return { value, next: cursor };
    shift += 7n;
    if (shift > 70n) return null;
  }
  return null;
}

function decodeZigZag(value: bigint): number | null {
  const decoded = (value >> 1n) ^ (-(value & 1n));
  const asNumber = Number(decoded);
  return Number.isSafeInteger(asNumber) ? asNumber : null;
}

function readLengthDelimited(bytes: Buffer, offset: number): { value: Buffer; next: number } | null {
  const length = readVarint(bytes, offset);
  if (!length) return null;
  const size = Number(length.value);
  if (!Number.isSafeInteger(size) || size < 0) return null;
  const end = length.next + size;
  if (end > bytes.length) return null;
  return { value: bytes.subarray(length.next, end), next: end };
}

function skipField(bytes: Buffer, wireType: number, offset: number): number | null {
  if (wireType === 0) return readVarint(bytes, offset)?.next ?? null;
  if (wireType === 1) return offset + 8 <= bytes.length ? offset + 8 : null;
  if (wireType === 2) return readLengthDelimited(bytes, offset)?.next ?? null;
  if (wireType === 5) return offset + 4 <= bytes.length ? offset + 4 : null;
  return null;
}

function readBase64Payload(message: string | Buffer): Buffer | null {
  const envelope = readJsonEnvelope(message);
  const encoded = typeof envelope?.message === "string" ? envelope.message.trim() : "";
  if (!encoded || !/^[A-Za-z0-9+/=_-]+$/.test(encoded)) return null;
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(normalized, "base64");
  return bytes.length > 0 ? bytes : null;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 解码 Yahoo streamer 返回的 PricingData。
 *
 * Yahoo 的 WS 消息格式是 JSON envelope，`message` 字段为 base64 protobuf；
 * 这里只解析图表和价格流需要的字段，未知字段直接跳过。
 */
export function decodeYahooPricingDataMessage(message: string | Buffer): YahooRealtimePriceUpdate | null {
  const bytes = readBase64Payload(message);
  if (!bytes) return null;

  let cursor = 0;
  const fields: Record<string, unknown> = {};

  while (cursor < bytes.length) {
    const key = readVarint(bytes, cursor);
    if (!key) return null;
    cursor = key.next;

    const field = Number(key.value >> 3n);
    const wireType = Number(key.value & 0x7n);

    if (wireType === 2) {
      const item = readLengthDelimited(bytes, cursor);
      if (!item) return null;
      cursor = item.next;
      if (field === 1) fields.symbol = item.value.toString("utf8");
      else if (field === 4) fields.currency = item.value.toString("utf8");
      continue;
    }

    if (wireType === 5) {
      if (cursor + 4 > bytes.length) return null;
      const value = bytes.readFloatLE(cursor);
      cursor += 4;
      if (field === 2) fields.price = value;
      else if (field === 8) fields.changePercent = value;
      else if (field === 10) fields.dayHigh = value;
      else if (field === 11) fields.dayLow = value;
      else if (field === 12) fields.change = value;
      else if (field === 15) fields.openPrice = value;
      else if (field === 16) fields.previousClose = value;
      continue;
    }

    if (wireType === 0) {
      const item = readVarint(bytes, cursor);
      if (!item) return null;
      cursor = item.next;
      const decoded = decodeZigZag(item.value);
      if (decoded == null) return null;
      if (field === 3) fields.time = decoded;
      else if (field === 9) fields.dayVolume = decoded;
      continue;
    }

    const next = skipField(bytes, wireType, cursor);
    if (next == null) return null;
    cursor = next;
  }

  const symbol = typeof fields.symbol === "string" ? fields.symbol.trim().toUpperCase() : "";
  const price = fields.price;
  const time = fields.time;
  if (!symbol || !finitePositive(price) || typeof time !== "number" || !Number.isFinite(time) || time <= 0) return null;

  return {
    symbol,
    price,
    ts: new Date(time * 1000).toISOString(),
    currency: typeof fields.currency === "string" && fields.currency.trim() ? fields.currency.trim().toUpperCase() : "USD",
    change: typeof fields.change === "number" && Number.isFinite(fields.change) ? fields.change : undefined,
    changePercent: typeof fields.changePercent === "number" && Number.isFinite(fields.changePercent) ? fields.changePercent : undefined,
    dayVolume: typeof fields.dayVolume === "number" && Number.isFinite(fields.dayVolume) ? fields.dayVolume : undefined,
    dayHigh: typeof fields.dayHigh === "number" && Number.isFinite(fields.dayHigh) ? fields.dayHigh : undefined,
    dayLow: typeof fields.dayLow === "number" && Number.isFinite(fields.dayLow) ? fields.dayLow : undefined,
    openPrice: typeof fields.openPrice === "number" && Number.isFinite(fields.openPrice) ? fields.openPrice : undefined,
    previousClose: typeof fields.previousClose === "number" && Number.isFinite(fields.previousClose) ? fields.previousClose : undefined,
    source: "yahoo_streamer",
  };
}

function loadWebSocketConstructor(): WebSocketConstructor {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = eval("require")("ws") as WebSocketConstructor | { default?: WebSocketConstructor };
  const ctor = "default" in mod && mod.default ? mod.default : mod;
  return ctor as WebSocketConstructor;
}

export class YahooRealtimeQuoteHub {
  private readonly url: string;
  private ws: WebSocketLike | null = null;
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connecting = false;

  constructor(url = YAHOO_STREAMER_URL) {
    this.url = url;
  }

  subscribe(symbols: string[], subscriber: Subscriber): () => void {
    const normalized = symbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean);
    for (const symbol of normalized) {
      const set = this.subscribers.get(symbol) ?? new Set<Subscriber>();
      set.add(subscriber);
      this.subscribers.set(symbol, set);
    }

    this.ensureConnected();
    this.sendSubscriptions();

    return () => {
      for (const symbol of normalized) {
        const set = this.subscribers.get(symbol);
        if (!set) continue;
        set.delete(subscriber);
        if (set.size <= 0) this.subscribers.delete(symbol);
      }
      if (this.subscribers.size <= 0) this.close();
      else this.sendSubscriptions();
    };
  }

  private ensureConnected(): void {
    if (this.connecting) return;
    if (this.ws && this.ws.readyState === loadWebSocketConstructor().OPEN) return;

    this.connecting = true;
    const WebSocketCtor = loadWebSocketConstructor();
    const ws = new WebSocketCtor(this.url);
    this.ws = ws;

    ws.on("open", () => {
      this.connecting = false;
      this.reconnectAttempt = 0;
      this.sendSubscriptions();
      this.startHeartbeat();
    });

    ws.on("message", (data) => {
      const update = decodeYahooPricingDataMessage(Buffer.isBuffer(data) ? data : String(data));
      if (!update) return;
      const set = this.subscribers.get(update.symbol);
      if (!set) return;
      for (const subscriber of set) subscriber(update);
    });

    ws.on("error", () => {
      this.scheduleReconnect();
    });

    ws.on("close", () => {
      this.connecting = false;
      this.ws = null;
      this.stopHeartbeat();
      if (this.subscribers.size > 0) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.subscribers.size <= 0) return;
    const delay = Math.min(RECONNECT_BASE_MS * (2 ** this.reconnectAttempt), RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private sendSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== loadWebSocketConstructor().OPEN) return;
    const symbols = [...this.subscribers.keys()];
    if (symbols.length <= 0) return;
    this.ws.send(JSON.stringify({ subscribe: symbols }));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendSubscriptions(), SUBSCRIPTION_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    this.connecting = false;
    try { ws?.close(); } catch { /* noop */ }
  }
}

export function getYahooRealtimeQuoteHub(): YahooRealtimeQuoteHub {
  singletonHub ??= new YahooRealtimeQuoteHub();
  return singletonHub;
}
