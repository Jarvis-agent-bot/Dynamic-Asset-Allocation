import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

/**
 * Build a daily report text from WorkbenchBootstrap data.
 * Uses Telegram MarkdownV2 style with structured layout.
 */
export function buildDailyReportText(bootstrap: WorkbenchBootstrap): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const lines: string[] = [];

  // ─── Header ───
  lines.push(`📊 *${esc(DAA_BRAND_NAME)} 每日报告* ${esc(dateStr)}`);
  lines.push("");

  // ─── Portfolio overview ───
  const equity = bootstrap.account.totalEquity;
  const cash = bootstrap.account.cash;
  const holdings = bootstrap.assetUniverse.filter((a) => a.holdingQty > 0);
  const holdingsValue = holdings.reduce((s, a) => s + (a.valuationBase ?? 0), 0);

  lines.push("*💰 组合概览*");
  lines.push(`\`总权益  ${fmtMoney(equity ?? 0)}\``);
  lines.push(`\`持仓    ${fmtMoney(holdingsValue)}  (${holdings.length}个标的)\``);
  lines.push(`\`现金    ${fmtMoney(cash)}\``);
  lines.push("");

  // ─── Holdings table ───
  if (holdings.length > 0) {
    lines.push("*📋 持仓明细*");
    lines.push(`\`${"标的".padEnd(10)}${"市值".padStart(10)}${"权重".padStart(8)}${"盈亏".padStart(8)}\``);
    lines.push(`\`${"─".repeat(36)}\``);

    const sorted = [...holdings].sort((a, b) => (b.valuationBase ?? 0) - (a.valuationBase ?? 0));
    for (const h of sorted.slice(0, 8)) {
      const sym = h.symbol.padEnd(10).slice(0, 10);
      const val = fmtMoney(h.valuationBase ?? 0).padStart(10);
      const wt = `${(h.actualWeightPct ?? 0).toFixed(1)}%`.padStart(8);
      const cost = h.costBasis ?? 0;
      const pnlPct = cost > 0 ? (((h.valuationBase ?? 0) - cost) / cost) * 100 : 0;
      const pnl = `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`.padStart(8);
      lines.push(`\`${sym}${val}${wt}${pnl}\``);
    }
    lines.push("");
  }

  // ─── Market context ───
  const mc = bootstrap.marketContext;
  if (mc) {
    lines.push("*🌍 市场环境*");
    const vix = mc.indicators.find((i) => i.key === "vix");
    const vixStr = vix ? `VIX ${fmtNum(vix.rawValue ?? 0)}` : "";

    lines.push(`综合: ${regimeEmoji(mc.regime)} ${regimeLabel(mc.regime)}${vixStr ? ` \\| ${esc(vixStr)}` : ""}`);

    if (mc.scopes.length > 0) {
      for (const s of mc.scopes) {
        lines.push(`  ${regimeEmoji(s.regime)} ${esc(s.label)}: ${regimeLabel(s.regime)}`);
      }
    }
    lines.push("");
  }

  // ─── Drift monitor ───
  const withGap = bootstrap.assetUniverse
    .filter((a) => a.gapPct != null && a.holdingQty > 0)
    .sort((a, b) => Math.abs(b.gapPct!) - Math.abs(a.gapPct!));

  if (withGap.length > 0) {
    const thresholdPct = bootstrap.rebalanceStrategy.drift.thresholdPct * 100;
    lines.push("*⚖️ 偏移监控*");

    for (const a of withGap.slice(0, 5)) {
      const gap = a.gapPct!;
      const alert = Math.abs(gap) >= thresholdPct ? " ⚠️" : "";
      lines.push(`  ${esc(a.symbol)}: ${gap >= 0 ? "\\+" : ""}${esc(fmtNum(gap))}%${alert}`);
    }
    lines.push(`  _阈值: ${esc(fmtNum(thresholdPct))}%_`);
    lines.push("");
  }

  // ─── Top movers ───
  const priced = bootstrap.assetUniverse.filter(
    (a) => a.holdingQty > 0 && a.lastPrice > 0 && a.holdingPrice > 0,
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
      lines.push("*📈 今日涨跌*");
      for (const g of gainers) {
        lines.push(`  🟢 ${esc(g.symbol)} \\+${esc(fmtNum(Math.abs(g.changePct)))}%`);
      }
      for (const l of losers) {
        lines.push(`  🔴 ${esc(l.symbol)} \\-${esc(fmtNum(Math.abs(l.changePct)))}%`);
      }
      lines.push("");
    }
  }

  // ─── Reminders ───
  const reminders: string[] = [];
  if (bootstrap.rebalanceStrategy.calendar.enabled) {
    const nextDay = bootstrap.rebalanceStrategy.calendar.dayOfMonth;
    const nextDate = computeNextRebalanceDate(now, nextDay);
    reminders.push(`下次定期再平衡: ${nextDate}`);
  }
  if (reminders.length > 0) {
    lines.push("*🔔 提醒*");
    for (const r of reminders) {
      lines.push(`• ${esc(r)}`);
    }
    lines.push("");
  }

  lines.push("_仅供参考，不构成投资建议。_");

  return lines.join("\n");
}

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

function esc(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function regimeLabel(regime: string): string {
  const map: Record<string, string> = {
    risk_on: "偏进攻",
    transitional: "过渡期",
    risk_off: "防守",
  };
  return map[regime] || regime;
}

function regimeEmoji(regime: string): string {
  if (regime === "risk_on") return "🟢";
  if (regime === "risk_off") return "🔴";
  return "🟡";
}

function computeNextRebalanceDate(now: Date, dayOfMonth: number): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();

  if (today < dayOfMonth) {
    return `${String(m + 1).padStart(2, "0")}\\-${String(dayOfMonth).padStart(2, "0")}`;
  }
  const next = new Date(y, m + 1, 1);
  return `${String(next.getMonth() + 1).padStart(2, "0")}\\-${String(dayOfMonth).padStart(2, "0")}`;
}
