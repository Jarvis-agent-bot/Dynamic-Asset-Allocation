import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import { DAA_BRAND_NAME } from "@/src/daa/brand";
import { marketRegimeActionLabelZh } from "@/src/daa/modules/marketContext/marketContextLabels";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { resolvePositionPnlPct } from "@/src/daa/modules/portfolio-state/positionPnl";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

/**
 * Build a daily review text from WorkbenchBootstrap data.
 * Uses Telegram HTML parse mode for clean formatting (no MarkdownV2 escape issues).
 */
export async function buildDailyReviewText(bootstrap: WorkbenchBootstrap): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const lines: string[] = [];

  // ─── Header ───
  lines.push(`📊 <b>${h(DAA_BRAND_NAME)} 每日复核</b> ${h(dateStr)}`);
  lines.push("");

  // ─── Portfolio overview ───
  const equity = bootstrap.account.totalEquity;
  const cash = bootstrap.account.cash;
  const holdings = bootstrap.assetUniverse.filter(isVisibleHolding);
  const holdingsValue = holdings.reduce((s, a) => s + (a.valuationBase ?? 0), 0);

  lines.push("💰 <b>组合概览</b>");
  lines.push(`总权益  <code>${fmtMoney(equity ?? 0)}</code>`);
  lines.push(`持仓    <code>${fmtMoney(holdingsValue)}</code>  (${holdings.length}个标的)`);
  lines.push(`现金    <code>${fmtMoney(cash)}</code>`);
  lines.push("");

  // ─── Holdings table ───
  if (holdings.length > 0) {
    lines.push("📋 <b>持仓明细</b>");
    lines.push("<pre>");
    lines.push(`${"标的".padEnd(12)}${"市值".padStart(8)}${"权重".padStart(7)}${"盈亏".padStart(8)}`);
    lines.push("─".repeat(35));

    const sorted = [...holdings].sort((a, b) => (b.valuationBase ?? 0) - (a.valuationBase ?? 0));
    for (const row of sorted.slice(0, 8)) {
      const sym = row.symbol.padEnd(12).slice(0, 12);
      const val = fmtMoney(row.valuationBase ?? 0).padStart(8);
      const wt = `${(row.actualWeightPct ?? 0).toFixed(1)}%`.padStart(7);
      const pnlPct = resolvePositionPnlPct(row);
      const pnl = (pnlPct == null ? "N/A" : `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`).padStart(8);
      lines.push(`${sym}${val}${wt}${pnl}`);
    }
    lines.push("</pre>");

    // 每个持仓的新闻摘要（如果有 LLM 分析）
    try {
      const { daaPgPool } = await import("@/src/daa/pg/daaPg");
      const pool = daaPgPool();
      for (const row of sorted.slice(0, 4)) {
        const newsResult = await pool.query(
          `SELECT llm_summary, llm_action_hint FROM daa_news_signal_snapshot_v1
           WHERE symbol = $1 AND llm_summary IS NOT NULL
           ORDER BY generated_at DESC LIMIT 1`,
          [row.symbol],
        );
        const newsRow = newsResult.rows[0] as Record<string, unknown> | undefined;
        if (newsRow?.llm_summary) {
          const summary = String(newsRow.llm_summary).slice(0, 120);
          lines.push(`  📰 ${h(row.symbol)}: ${h(summary)}`);
        }
      }
    } catch (e) {
      logSwallowed("dailyReview.newsSummary", e);
    }
    lines.push("");
  }

  // ─── Market context ───
  const mc = bootstrap.marketContext;
  if (mc) {
    lines.push("🌍 <b>市场环境</b>");
    const vix = mc.indicators.find((i) => i.key === "vix");
    const vixStr = vix ? ` | VIX ${fmtNum(vix.rawValue ?? 0)}` : "";

    lines.push(`综合: ${regimeEmoji(mc.regime)} ${regimeLabel(mc.regime)}${vixStr}`);

    for (const s of mc.scopes) {
      lines.push(`  ${regimeEmoji(s.regime)} ${h(s.label)}: ${regimeLabel(s.regime)}`);
    }

    // 关键市场指标百分位
    const keyIndicators = mc.indicators
      .filter((i) => i.rawValue != null && i.percentile252 != null)
      .slice(0, 6);
    if (keyIndicators.length > 0) {
      lines.push("");
      lines.push("📐 <b>关键指标</b>");
      lines.push("<pre>");
      lines.push(`${"指标".padEnd(10)}${"值".padStart(7)}${"百分位".padStart(6)}${"趋势".padStart(6)}`);
      for (const ind of keyIndicators) {
        const label = indicatorShortLabel(ind.key).padEnd(10).slice(0, 10);
        const val = fmtNum(ind.rawValue ?? 0).padStart(7);
        const pct = `${Math.round(ind.percentile252 ?? 0)}%`.padStart(6);
        const trend7d = ind.trend7dPct != null
          ? `${ind.trend7dPct >= 0 ? "+" : ""}${fmtNum(ind.trend7dPct)}%`.padStart(6)
          : "   N/A";
        lines.push(`${label}${val}${pct}${trend7d}`);
      }
      lines.push("</pre>");
    }
    lines.push("");
  }

  // ─── Drift monitor ───
  const withGap = bootstrap.assetUniverse
    .filter((a) => a.gapPct != null && isVisibleHolding(a))
    .sort((a, b) => Math.abs(b.gapPct!) - Math.abs(a.gapPct!));

  if (withGap.length > 0) {
    const driftThresholdPct = bootstrap.policy.drift.outerBandPct * 100;
    const driftInnerBandPct = bootstrap.policy.drift.innerBandPct * 100;
    lines.push("⚖️ <b>偏移监控</b>");

    for (const a of withGap.slice(0, 5)) {
      const gap = a.gapPct!;
      const alert = Math.abs(gap) >= driftThresholdPct ? " ⚠️" : "";
      lines.push(`  ${h(a.symbol)}: ${gap >= 0 ? "+" : ""}${fmtNum(gap)}%${alert}`);
    }
    lines.push(`  <i>阈值: ${fmtNum(driftThresholdPct)}%</i>`);
    lines.push("");

    const actionable = withGap
      .filter((a) => Math.abs(a.gapPct ?? 0) >= driftInnerBandPct)
      .slice(0, 4);
    if (actionable.length > 0) {
      lines.push("🎯 <b>调仓关注</b>");
      for (const a of actionable) {
        const gap = a.gapPct ?? 0;
        const action = gap > 0 ? "买入/加仓" : "卖出/减仓";
        lines.push(`  ${h(a.symbol)}: ${action} (${gap >= 0 ? "+" : ""}${fmtNum(gap)}%)`);
      }
      lines.push("");
    }
  }

  // ─── Top movers ───
  const priced = bootstrap.assetUniverse.filter(
    (a) => isVisibleHolding(a) && a.lastPrice > 0 && a.holdingPrice > 0,
  );
  if (priced.length > 0) {
    const withChange = priced.map((a) => ({
      symbol: a.symbol,
      changePct: ((a.lastPrice - a.holdingPrice) / a.holdingPrice) * 100,
    }));
    withChange.sort((a, b) => b.changePct - a.changePct);

    const gainers = withChange.filter((a) => a.changePct > 0.01).slice(0, 3);
    const losers = withChange.filter((a) => a.changePct < -0.01).sort((a, b) => a.changePct - b.changePct).slice(0, 3);

    if (gainers.length > 0 || losers.length > 0) {
      lines.push("📈 <b>今日涨跌</b>");
      for (const g of gainers) {
        lines.push(`  🟢 ${h(g.symbol)} +${fmtNum(Math.abs(g.changePct))}%`);
      }
      for (const l of losers) {
        lines.push(`  🔴 ${h(l.symbol)} -${fmtNum(Math.abs(l.changePct))}%`);
      }
      lines.push("");
    }
  }

  // ─── Reminders ───
  const reminders: string[] = [];
  if (bootstrap.policy.review.enabled) {
    const nextDay = bootstrap.policy.review.dayOfMonth;
    const freq = bootstrap.policy.review.frequency;
    if (freq === "every_3_days" || freq === "weekly") {
      reminders.push(`定期组合复盘: 每${freq === "every_3_days" ? "3天" : "周"}自动复盘`);
    } else {
      const nextDate = computeNextRebalanceDate(now, nextDay);
      reminders.push(`下次定期组合复盘: ${nextDate}`);
    }
  }
  if (reminders.length > 0) {
    lines.push("🔔 <b>提醒</b>");
    for (const r of reminders) {
      lines.push(`• ${h(r)}`);
    }
    lines.push("");
  }

  lines.push("<i>仅供参考，不构成投资建议。</i>");

  return lines.join("\n");
}

/** 返回 "HTML" 作为 Telegram parseMode */
export const DAILY_REVIEW_PARSE_MODE = "HTML";

// ─── Helpers ───

function fmtNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "N/A";
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "$N/A";
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** HTML escape for Telegram HTML mode */
function h(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function indicatorShortLabel(key: string): string {
  const map: Record<string, string> = {
    vix: "VIX",
    qqq_spy_ratio: "QQQ/SPY",
    fxi_volatility: "FXI波动",
    kweb_fxi_ratio: "科技/中概",
    btc_eth_ratio: "BTC/ETH",
    btc_volatility: "BTC波动",
    gold_silver_ratio: "金银比",
    yield_curve_spread: "利差",
    usd_strength: "美元",
    credit_spread: "信用利差",
    inflation_expectation: "通胀预期",
    market_breadth: "市场广度",
  };
  return map[key] || key;
}

function regimeLabel(regime: string): string {
  return marketRegimeActionLabelZh(regime);
}

function regimeEmoji(regime: string): string {
  if (regime === "risk_on") return "🟢";
  if (regime === "risk_off") return "🔴";
  return "🟡";
}

function computeNextRebalanceDate(now: Date, dayOfMonth: number): string {
  const m = now.getMonth();
  const today = now.getDate();
  if (today < dayOfMonth) {
    return `${String(m + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
  }
  const next = new Date(now.getFullYear(), m + 1, 1);
  return `${String(next.getMonth() + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}
