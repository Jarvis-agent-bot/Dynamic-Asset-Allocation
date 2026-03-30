import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type HfHoldingEntry = {
  fundName: string;
  fundCode: string;
  symbol: string;
  market: string;
  action: "买入" | "卖出" | "持仓";
  weightPct: number;
  prevWeightPct: number;
  changePct: number;
  reportDate: string;
  disclosedAt: string | null;
};

type HfHoldingsReadModel = {
  recentChanges: HfHoldingEntry[];
  lastUpdatedAt: string | null;
  baseCurrency: string;
};

async function buildHfHoldingsReadModel(): Promise<HfHoldingsReadModel> {
  const systemConfig = await getDaaSystemConfig();
  const baseCurrency = systemConfig.config.strategy.account.baseCurrency;

  try {
    const pool = daaPgPool();

    // Check if table exists
    const { rows: tableCheck } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'daa_hf_holding_snapshot_v1' LIMIT 1`,
    );

    if (tableCheck.length === 0) {
      return {
        recentChanges: [],
        lastUpdatedAt: null,
        baseCurrency,
      };
    }

    // Get recent HF holdings with significant changes
    // Sort by report_date DESC, then by absolute weight change
    const { rows } = await pool.query(
      `SELECT
        fund_code,
        symbol,
        market,
        weight_pct,
        prev_weight_pct,
        report_date,
        disclosed_at,
        fetched_at
      FROM daa_hf_holding_snapshot_v1
      ORDER BY report_date DESC, ABS(weight_pct - prev_weight_pct) DESC
      LIMIT 50`,
    );

    // Build fund name map (using seed data naming)
    const fundNameMap: Record<string, string> = {
      "110022": "易方达消费行业",
      "163402": "兴全趋势投资",
      "519674": "银河创新成长",
      "000968": "广发多因子",
      "090018": "大成消费主题",
      // Add more fund codes as needed
    };

    const recentChanges: HfHoldingEntry[] = rows
      .filter((row: any) => {
        const changePct = Math.abs(Number(row.weight_pct) - Number(row.prev_weight_pct));
        return changePct >= 0.1; // Only significant changes (>= 0.1%)
      })
      .slice(0, 20) // Limit to 20 recent entries
      .map((row: any) => {
        const weight = Number(row.weight_pct);
        const prevWeight = Number(row.prev_weight_pct);
        const changePct = weight - prevWeight;

        let action: "买入" | "卖出" | "持仓" = "持仓";
        if (changePct > 0.1) action = "买入";
        if (changePct < -0.1) action = "卖出";

        return {
          fundName: fundNameMap[row.fund_code] || row.fund_code,
          fundCode: row.fund_code,
          symbol: row.symbol,
          market: row.market,
          action,
          weightPct: Number(weight.toFixed(2)),
          prevWeightPct: Number(prevWeight.toFixed(2)),
          changePct: Number(changePct.toFixed(2)),
          reportDate: row.report_date,
          disclosedAt: row.disclosed_at,
        };
      });

    // Get the most recent update timestamp
    const lastUpdatedAt = rows.length > 0 ? rows[0].fetched_at : null;

    return {
      recentChanges,
      lastUpdatedAt,
      baseCurrency,
    };
  } catch (err) {
    logSwallowed("[daa/read/hf-holdings] error", err);
    return {
      recentChanges: [],
      lastUpdatedAt: null,
      baseCurrency,
    };
  }
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    try {
      const data = await buildHfHoldingsReadModel();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[daa/read/hf-holdings] error:", err);
      return new Response(
        JSON.stringify({
          recentChanges: [],
          lastUpdatedAt: null,
          baseCurrency: "USD",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  });
}
