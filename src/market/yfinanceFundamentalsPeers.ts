import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import {
  FUNDAMENTAL_PEER_PERCENTILE_MIN_SAMPLE_COUNT,
  type FundamentalPeerGroupBasis,
  type YfinanceFundamentalSnapshot,
} from "@/src/market/yfinanceFundamentals";

export const YFINANCE_FUNDAMENTALS_PEER_MAX_EXTRA_SYMBOLS = 36;

type PeerBasket = {
  key: string;
  label: string;
  symbols: string[];
};

type PeerGroup = {
  key: string;
  label: string;
  basis: FundamentalPeerGroupBasis;
  snapshots: YfinanceFundamentalSnapshot[];
};

type PeerMetricStats = {
  percentile: number | null;
  sampleCount: number;
  median: number | null;
  eligible: boolean;
  reason: string | null;
};

const CURATED_PEER_BASKETS_: PeerBasket[] = [
  {
    key: "consumer_hardware_platforms",
    label: "消费电子硬件同业",
    symbols: ["1810.HK", "AAPL", "005930.KS", "SONY", "0992.HK", "HPQ", "DELL", "LOGI", "GRMN", "2357.TW", "2382.TW"],
  },
  {
    key: "china_internet_platforms",
    label: "中国互联网平台同业",
    symbols: ["9988.HK", "0700.HK", "3690.HK", "9618.HK", "9999.HK", "1024.HK", "PDD", "JD", "BIDU", "NTES", "TME", "BILI"],
  },
  {
    key: "semiconductors",
    label: "半导体产业链同业",
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "ASML", "ARM", "MU", "000660.KS", "005930.KS", "INTC", "QCOM", "TXN", "AMAT", "LRCX", "KLAC", "MRVL", "ON"],
  },
  {
    key: "mega_cap_platforms",
    label: "大型科技平台同业",
    symbols: ["AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "NVDA"],
  },
  {
    key: "exchange_operators",
    label: "交易所运营商同业",
    symbols: ["0388.HK", "CME", "ICE", "NDAQ", "CBOE", "LSEG.L", "DB1.DE", "SGX.SI"],
  },
];

function normalizedKey(value: string | null | undefined): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function normalizeSymbols(symbols: Iterable<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of symbols) {
    const symbol = normalizeYfinanceSymbol(item || "");
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }
  return out;
}

function basketSymbolsFor(symbol: string): string[] {
  const normalized = normalizeYfinanceSymbol(symbol);
  if (!normalized) return [];
  return normalizeSymbols(
    CURATED_PEER_BASKETS_
      .filter((basket) => normalizeSymbols(basket.symbols).includes(normalized))
      .flatMap((basket) => basket.symbols),
  );
}

function basketLabelFor(symbol: string): string | null {
  const normalized = normalizeYfinanceSymbol(symbol);
  const basket = CURATED_PEER_BASKETS_.find((item) => normalizeSymbols(item.symbols).includes(normalized));
  return basket?.label ?? null;
}

function catalogPeerSymbolsFor(symbol: string): string[] {
  const normalized = normalizeYfinanceSymbol(symbol);
  const item = WORKBENCH_FEATURED_ASSETS_CATALOG_.find((entry) => normalizeYfinanceSymbol(entry.symbol) === normalized);
  if (!item || item.assetClass !== "EQUITY") return [];

  return normalizeSymbols(
    WORKBENCH_FEATURED_ASSETS_CATALOG_
      .filter((entry) => {
        if (entry.assetClass !== "EQUITY") return false;
        if (item.themeKey === "semiconductor") return entry.themeKey === item.themeKey;
        return entry.themeLabelZh === item.themeLabelZh;
      })
      .map((entry) => entry.symbol),
  );
}

export function getYfinanceFundamentalPeerCandidates(symbols: string[], opts: {
  maxExtraSymbols?: number;
} = {}): string[] {
  const requested = new Set(normalizeSymbols(symbols));
  const maxExtraSymbols = opts.maxExtraSymbols ?? YFINANCE_FUNDAMENTALS_PEER_MAX_EXTRA_SYMBOLS;
  const candidates: string[] = [];
  const seen = new Set<string>(requested);

  for (const symbol of requested) {
    const peerSymbols = normalizeSymbols([
      ...basketSymbolsFor(symbol),
      ...catalogPeerSymbolsFor(symbol),
    ]);
    for (const peer of peerSymbols) {
      if (seen.has(peer)) continue;
      seen.add(peer);
      candidates.push(peer);
      if (candidates.length >= maxExtraSymbols) return candidates;
    }
  }

  return candidates;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  return left == null || right == null ? null : (left + right) / 2;
}

function metricValue(snapshot: YfinanceFundamentalSnapshot, metric: "pe" | "pb"): number | null {
  const value = metric === "pe" ? snapshot.trailingPE : snapshot.pbRatio;
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null;
}

function metricStats(target: YfinanceFundamentalSnapshot, group: YfinanceFundamentalSnapshot[], metric: "pe" | "pb"): PeerMetricStats {
  const targetValue = metricValue(target, metric);
  const values = group
    .map((snapshot) => metricValue(snapshot, metric))
    .filter((value): value is number => value != null);
  const sampleCount = values.length;
  if (targetValue == null) {
    return {
      percentile: null,
      sampleCount,
      median: median(values),
      eligible: false,
      reason: `missing_target_${metric}`,
    };
  }
  if (sampleCount < FUNDAMENTAL_PEER_PERCENTILE_MIN_SAMPLE_COUNT) {
    return {
      percentile: null,
      sampleCount,
      median: median(values),
      eligible: false,
      reason: `insufficient_peer_sample_count:${sampleCount}/${FUNDAMENTAL_PEER_PERCENTILE_MIN_SAMPLE_COUNT}`,
    };
  }
  const rank = values.filter((value) => value <= targetValue).length;
  return {
    percentile: Number(((rank / sampleCount) * 100).toFixed(2)),
    sampleCount,
    median: median(values),
    eligible: true,
    reason: null,
  };
}

function uniqueSnapshots(snapshots: YfinanceFundamentalSnapshot[]): YfinanceFundamentalSnapshot[] {
  const bySymbol = new Map<string, YfinanceFundamentalSnapshot>();
  for (const snapshot of snapshots) {
    const symbol = normalizeYfinanceSymbol(snapshot.normalizedSymbol || snapshot.symbol);
    if (!symbol || bySymbol.has(symbol)) continue;
    bySymbol.set(symbol, snapshot);
  }
  return [...bySymbol.values()];
}

function sameProfileGroup(target: YfinanceFundamentalSnapshot, snapshots: YfinanceFundamentalSnapshot[], basis: "industry" | "sector"): PeerGroup | null {
  const targetLabel = basis === "industry" ? target.industry : target.sector;
  const targetKey = normalizedKey(basis === "industry" ? (target.industryKey || target.industry) : (target.sectorKey || target.sector));
  if (!targetKey || !targetLabel) return null;
  const group = snapshots.filter((snapshot) => (
    normalizedKey(basis === "industry" ? (snapshot.industryKey || snapshot.industry) : (snapshot.sectorKey || snapshot.sector)) === targetKey
  ));
  if (group.length === 0) return null;
  return {
    key: `${basis}:${targetKey}`,
    label: basis === "industry" ? `行业：${targetLabel}` : `板块：${targetLabel}`,
    basis,
    snapshots: uniqueSnapshots(group),
  };
}

function curatedGroup(target: YfinanceFundamentalSnapshot, snapshots: YfinanceFundamentalSnapshot[]): PeerGroup | null {
  const symbol = normalizeYfinanceSymbol(target.normalizedSymbol || target.symbol);
  const peerSymbols = new Set(normalizeSymbols([
    symbol,
    ...basketSymbolsFor(symbol),
    ...catalogPeerSymbolsFor(symbol),
  ]));
  if (peerSymbols.size <= 1) return null;
  const group = snapshots.filter((snapshot) => peerSymbols.has(normalizeYfinanceSymbol(snapshot.normalizedSymbol || snapshot.symbol)));
  if (group.length === 0) return null;
  return {
    key: `curated:${[...peerSymbols].sort().join(",")}`,
    label: basketLabelFor(symbol) ?? "受控同业样本",
    basis: "curated_basket",
    snapshots: uniqueSnapshots(group),
  };
}

function scoreGroup(target: YfinanceFundamentalSnapshot, group: PeerGroup): { pe: PeerMetricStats; pb: PeerMetricStats; maxSampleCount: number; eligible: boolean } {
  const pe = metricStats(target, group.snapshots, "pe");
  const pb = metricStats(target, group.snapshots, "pb");
  return {
    pe,
    pb,
    maxSampleCount: Math.max(pe.sampleCount, pb.sampleCount),
    eligible: pe.eligible || pb.eligible,
  };
}

function enrichSnapshot(target: YfinanceFundamentalSnapshot, snapshots: YfinanceFundamentalSnapshot[]): YfinanceFundamentalSnapshot {
  const groups = [
    sameProfileGroup(target, snapshots, "industry"),
    sameProfileGroup(target, snapshots, "sector"),
    curatedGroup(target, snapshots),
  ].filter((group): group is PeerGroup => group != null);

  if (groups.length === 0) {
    return {
      ...target,
      peerReason: "missing_peer_group",
    };
  }

  const scored = groups.map((group) => ({ group, stats: scoreGroup(target, group) }));
  const selected = scored.find((item) => item.stats.eligible)
    ?? [...scored].sort((a, b) => b.stats.maxSampleCount - a.stats.maxSampleCount)[0]!;
  const { group, stats } = selected;
  const peerReason = stats.eligible
    ? null
    : (stats.pe.reason ?? stats.pb.reason ?? "insufficient_peer_data");

  return {
    ...target,
    peerGroupKey: group.key,
    peerGroupLabel: group.label,
    peerGroupBasis: group.basis,
    peerSymbols: group.snapshots.map((snapshot) => normalizeYfinanceSymbol(snapshot.normalizedSymbol || snapshot.symbol)).filter(Boolean),
    peerMinSampleCount: FUNDAMENTAL_PEER_PERCENTILE_MIN_SAMPLE_COUNT,
    peerReason,
    pePeerPercentile: stats.pe.percentile,
    pePeerSampleCount: stats.pe.sampleCount,
    pePeerMedian: stats.pe.median,
    pbPeerPercentile: stats.pb.percentile,
    pbPeerSampleCount: stats.pb.sampleCount,
    pbPeerMedian: stats.pb.median,
  };
}

export function enrichYfinanceFundamentalSnapshotsWithPeers(
  requestedItems: Record<string, YfinanceFundamentalSnapshot>,
  peerItems: Record<string, YfinanceFundamentalSnapshot> = {},
): Record<string, YfinanceFundamentalSnapshot> {
  const snapshots = uniqueSnapshots([
    ...Object.values(requestedItems),
    ...Object.values(peerItems),
  ]);
  const enriched: Record<string, YfinanceFundamentalSnapshot> = {};
  for (const [symbol, snapshot] of Object.entries(requestedItems)) {
    enriched[symbol] = enrichSnapshot(snapshot, snapshots);
  }
  return enriched;
}
