export type DanjuanFundRegistryItemV1 = {
  fundCode: string;
  label: string;
  kind: "equity" | "qdii" | "balanced";
  enabled: boolean;
};

export type DanjuanHoldingRowV1 = {
  fundCode: string;
  fundName: string;
  reportDate: string;
  market: string;
  cashPercent: number;
  stockPercent: number;
  symbol: string;
  symbolRaw: string;
  assetName: string;
  weightPct: number;
  sourceRef: string;
};

const DEFAULT_REGISTRY: DanjuanFundRegistryItemV1[] = [
  { fundCode: "006533", label: "易方达科融混合", kind: "equity", enabled: true },
  { fundCode: "100055", label: "富国全球科技互联网", kind: "qdii", enabled: true },
  { fundCode: "005827", label: "易方达蓝筹精选", kind: "equity", enabled: true },
  { fundCode: "110011", label: "易方达中小盘", kind: "equity", enabled: true },
  { fundCode: "161725", label: "招商中证白酒指数", kind: "equity", enabled: true },
  { fundCode: "000248", label: "汇添富中证主要消费ETF联接", kind: "equity", enabled: true },
  { fundCode: "005918", label: "工银前沿医疗股票", kind: "equity", enabled: true },
  { fundCode: "486001", label: "工银全球精选股票QDII", kind: "qdii", enabled: true },
  { fundCode: "000834", label: "大成景安短融债券", kind: "balanced", enabled: true },
  { fundCode: "000874", label: "广发全球精选股票QDII", kind: "qdii", enabled: true },
];

function normalizeFundCode(value: string): string {
  const text = String(value || "").trim();
  return text;
}

function clampPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Number(n.toFixed(4));
}

function normalizeReportDate(raw: string): string {
  const compact = String(raw || "").replace(/[^0-9]/g, "");
  if (compact.length !== 8) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function toMarketByCode(symbol: string): string {
  const value = String(symbol || "").trim().toUpperCase();
  if (!value) return "UNKNOWN";
  if (/^[A-Z]{1,6}$/.test(value)) return "US";
  if (/^\d{5}$/.test(value)) return "HK";
  if (/^\d{6}$/.test(value)) return value.startsWith("6") ? "CN" : "CN";
  if (value.endsWith(".HK")) return "HK";
  if (value.endsWith(".SS") || value.endsWith(".SZ")) return "CN";
  return "UNKNOWN";
}

function toNormalizedSymbol(symbol: string): string {
  const value = String(symbol || "").trim().toUpperCase();
  if (!value) return "";
  if (/^[A-Z]{1,6}$/.test(value)) return value;
  if (/^\d{5}$/.test(value)) return `${value}.HK`;
  if (/^\d{6}$/.test(value)) return value.startsWith("6") ? `${value}.SS` : `${value}.SZ`;
  return value;
}

function quarterEnd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const q = Math.floor((m - 1) / 3) + 1;
  if (q === 1) return `${y}-03-31`;
  if (q === 2) return `${y}-06-30`;
  if (q === 3) return `${y}-09-30`;
  return `${y}-12-31`;
}

function shiftQuarter(date: Date, delta: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  next.setUTCMonth(next.getUTCMonth() + delta * 3);
  return next;
}

export function resolveDanjuanReportDatesV1(count = 2): string[] {
  const result: string[] = [];
  let cursor = new Date();
  for (let i = 0; i < Math.max(1, count); i += 1) {
    const d = quarterEnd(cursor);
    if (!result.includes(d)) result.push(d);
    cursor = shiftQuarter(cursor, -1);
  }
  return result;
}

export function resolveDanjuanFundRegistryV1(): DanjuanFundRegistryItemV1[] {
  const raw = String(process.env.DAA_HF_DANJUAN_FUNDS || "").trim();
  if (!raw) return [...DEFAULT_REGISTRY];

  const parsed = raw
    .split(",")
    .map((token) => normalizeFundCode(token))
    .filter(Boolean);

  if (parsed.length === 0) return [...DEFAULT_REGISTRY];

  return parsed.map((fundCode) => {
    const found = DEFAULT_REGISTRY.find((item) => item.fundCode === fundCode);
    if (found) return { ...found, enabled: true };
    return {
      fundCode,
      label: `基金 ${fundCode}`,
      kind: "equity",
      enabled: true,
    };
  });
}

export function isDanjuanSourceEnabledV1(): boolean {
  const raw = String(process.env.DAA_HF_DANJUAN_ENABLED || "").trim().toLowerCase();
  if (process.env.NODE_ENV === "test") return raw === "1" || raw === "true";
  if (!raw) return true;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function fetchDanjuanFundAssetPercentV1(params: {
  fundCode: string;
  reportDate: string;
  timeoutMs?: number;
}): Promise<DanjuanHoldingRowV1[]> {
  const fundCode = normalizeFundCode(params.fundCode);
  const reportDate = normalizeReportDate(params.reportDate);
  if (!fundCode || !reportDate) return [];

  const url = new URL("https://danjuanfunds.com/djapi/fundx/base/fund/record/asset/percent");
  url.searchParams.set("fund_code", fundCode);
  url.searchParams.set("report_date", reportDate);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(3000, params.timeoutMs ?? 12000));

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        accept: "application/json, text/plain, */*",
        referer: `https://danjuanfunds.com/rn/fund-detail/archive?id=103&code=${encodeURIComponent(fundCode)}`,
        origin: "https://danjuanfunds.com",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
    });

    if (!response.ok) return [];

    const text = await response.text();
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    const data = payload?.data;
    const rows = Array.isArray(data?.stock_list) ? data.stock_list : [];
    const sourceMark = normalizeReportDate(String(data?.source || data?.source_mark || reportDate));
    const cashPercent = clampPct(data?.cash_percent);
    const stockPercent = clampPct(data?.stock_percent);

    return rows
      .map((row: any) => {
        const symbolRaw = String(row?.code || "").trim();
        const symbol = toNormalizedSymbol(symbolRaw);
        if (!symbol) return null;
        const assetName = String(row?.name || symbolRaw || symbol).trim();
        return {
          fundCode,
          fundName: String(data?.fund_name || "").trim() || `基金 ${fundCode}`,
          reportDate: sourceMark || reportDate,
          cashPercent,
          stockPercent,
          symbol,
          symbolRaw,
          assetName,
          weightPct: clampPct(row?.percent),
          sourceRef: `https://danjuanfunds.com/rn/fund-detail/archive?id=103&code=${encodeURIComponent(fundCode)}`,
          market: toMarketByCode(symbolRaw),
        };
      })
      .filter(Boolean)
      .map((row: any) => ({
        fundCode: row.fundCode,
        fundName: row.fundName,
        reportDate: row.reportDate,
        market: row.market,
        cashPercent: row.cashPercent,
        stockPercent: row.stockPercent,
        symbol: row.symbol,
        symbolRaw: row.symbolRaw,
        assetName: row.assetName,
        weightPct: row.weightPct,
        sourceRef: row.sourceRef,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
