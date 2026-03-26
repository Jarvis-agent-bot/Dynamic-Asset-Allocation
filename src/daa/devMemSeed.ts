/**
 * Dev 模式数据自动初始化 — 仅在 DAA_PG_MEM=1 时首次加载填充样本数据。
 */

import { listDaaAssetUniverse, upsertDaaAssetUniverseRow } from "@/src/daa/store/assetUniverseStore";
import { replaceDaaAccountState } from "@/src/daa/store/accountStore";
import { replaceDaaPositions } from "@/src/daa/store/positionStore";
import { appendDaaEquitySnapshot } from "@/src/daa/store/portfolioStore";
import { WORKBENCH_FEATURED_ASSETS_CATALOG_ } from "@/src/daa/modules/workbench/featuredAssetsCatalog";

let seeded = false;

/** 从 featured catalog 中按 symbol 查找元数据 */
function findCatalogItem(symbol: string) {
  return WORKBENCH_FEATURED_ASSETS_CATALOG_.find((item) => item.symbol === symbol) ?? null;
}

/** 12 个种子资产：symbol → { lastPrice, targetWeightHint } */
const SEED_ASSETS_: Record<string, { lastPrice: number; targetWeightHint: number }> = {
  AAPL: { lastPrice: 210, targetWeightHint: 8 },
  MSFT: { lastPrice: 420, targetWeightHint: 8 },
  NVDA: { lastPrice: 880, targetWeightHint: 6 },
  SPY: { lastPrice: 520, targetWeightHint: 15 },
  QQQ: { lastPrice: 450, targetWeightHint: 12 },
  GLD: { lastPrice: 230, targetWeightHint: 8 },
  BND: { lastPrice: 72, targetWeightHint: 10 },
  "0700.HK": { lastPrice: 380, targetWeightHint: 5 },
  "600519.SS": { lastPrice: 1680, targetWeightHint: 5 },
  "BTC-USD": { lastPrice: 68000, targetWeightHint: 5 },
  EEM: { lastPrice: 43, targetWeightHint: 8 },
  TLT: { lastPrice: 92, targetWeightHint: 10 },
};

/** 5 个种子持仓 */
const SEED_POSITIONS_: Array<{
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number;
}> = [
  { symbol: "SPY", market: "US", currency: "USD", qty: 50, price: 520, costBasis: 495 },
  { symbol: "QQQ", market: "US", currency: "USD", qty: 30, price: 450, costBasis: 420 },
  { symbol: "AAPL", market: "US", currency: "USD", qty: 40, price: 210, costBasis: 185 },
  { symbol: "GLD", market: "US", currency: "USD", qty: 20, price: 230, costBasis: 210 },
  { symbol: "BND", market: "US", currency: "USD", qty: 50, price: 72, costBasis: 74 },
];

export async function seedDevDataIfNeeded(): Promise<void> {
  if (seeded) return;
  if (process.env.DAA_PG_MEM !== "1") {
    seeded = true;
    return;
  }

  try {
    // 检查是否已有数据
    const existing = await listDaaAssetUniverse();
    if (existing.length > 0) {
      seeded = true;
      return;
    }

    const now = new Date().toISOString();

    // 1. 写入 12 个资产
    for (const [symbol, { lastPrice, targetWeightHint }] of Object.entries(SEED_ASSETS_)) {
      const catalog = findCatalogItem(symbol);
      await upsertDaaAssetUniverseRow({
        symbol,
        market: catalog?.market ?? "US",
        currency: catalog?.currency ?? "USD",
        assetClass: catalog?.assetClass ?? "EQUITY",
        exchange: catalog?.exchange ?? "",
        watchEnabled: true,
        targetWeightHint,
        lastPrice,
        priceUpdatedAt: now,
      });
    }

    // 2. 写入账户状态
    await replaceDaaAccountState({
      cash: 15000,
      totalEquity: 100000,
    });

    // 3. 写入 5 个持仓（通过 replaceDaaPositions 同步 positions_v2 + asset_universe）
    await replaceDaaPositions(SEED_POSITIONS_);

    // 4. 生成 30 天权益快照（$95k → $100k 缓慢上涨）
    const baseEquity = 95000;
    const endEquity = 100000;
    const days = 30;
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      date.setHours(16, 0, 0, 0); // 收盘时间
      const progress = i / (days - 1);
      // 添加少量随机波动
      const noise = (Math.sin(i * 1.7) * 0.005 + Math.cos(i * 2.3) * 0.003);
      const equity = baseEquity + (endEquity - baseEquity) * progress + baseEquity * noise;
      const holdingsValue = equity * 0.85; // 约 85% 持仓，15% 现金
      const cash = equity - holdingsValue;

      await appendDaaEquitySnapshot({
        ts: date.toISOString(),
        totalEquity: Math.round(equity * 100) / 100,
        holdingsValue: Math.round(holdingsValue * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        source: "seed",
      });
    }

    seeded = true;
    console.log("[devMemSeed] 样本数据已初始化: 12 资产, 5 持仓, 30 天权益快照");
  } catch (err) {
    seeded = true; // 失败不重试
    console.warn("[devMemSeed] 初始化失败 (不影响正常使用):", err);
  }
}
