import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

/**
 * Build a daily report text from WorkbenchBootstrap data.
 * Designed for Telegram Markdown (also works as plain text for Feishu).
 */
export function buildDailyReportText(bootstrap: WorkbenchBootstrap): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const lines: string[] = [];

  // --- Header ---
  lines.push(`📊 *DeepLedger 每日报告* ${dateStr}`);
  lines.push("");

  // --- Portfolio overview ---
  const equity = bootstrap.account.totalEquity;
  const cash = bootstrap.account.cash;
  const holdings = bootstrap.assetUniverse.filter((a) => a.holdingQty > 0);

  lines.push("*组合概览*");
  lines.push(
    `总权益: ${equity != null ? `$${formatNum(equity)}` : "N/A"} | 现金: $${formatNum(cash)}`,
  );
  lines.push(`持仓: ${holdings.length} 个标的`);
  lines.push("");

  // --- Market context ---
  const mc = bootstrap.marketContext;
  if (mc) {
    lines.push("*市场环境*");
    const vix = mc.indicators.find((i) => i.key === "vix");
    const vixStr = vix ? ` | VIX ${formatNum(vix.rawValue ?? 0)}` : "";
    lines.push(`综合: ${regimeLabel(mc.regime)}${vixStr}`);

    if (mc.scopes.length > 0) {
      const scopeParts = mc.scopes.map(
        (s) => `${escapeMd(s.label)}: ${regimeLabel(s.regime)}`,
      );
      lines.push(`  ${scopeParts.join(" | ")}`);
    }
    lines.push("");
  }

  // --- Drift monitor ---
  const withGap = bootstrap.assetUniverse
    .filter((a) => a.gapPct != null && a.holdingQty > 0)
    .sort((a, b) => Math.abs(b.gapPct!) - Math.abs(a.gapPct!));

  if (withGap.length > 0) {
    const top = withGap[0];
    const thresholdPct = bootstrap.rebalanceStrategy.drift.thresholdPct * 100;
    lines.push("*偏移监控*");
    lines.push(
      `最大偏移: ${escapeMd(top.symbol)} ${formatSignedPct(top.gapPct!)} (阈值 ${formatNum(thresholdPct)}%)`,
    );
    lines.push("");
  }

  // --- Top movers ---
  const priced = bootstrap.assetUniverse.filter(
    (a) => a.holdingQty > 0 && a.lastPrice > 0 && a.holdingPrice > 0,
  );
  if (priced.length > 0) {
    const withChange = priced.map((a) => ({
      symbol: a.symbol,
      changePct: ((a.lastPrice - a.holdingPrice) / a.holdingPrice) * 100,
    }));
    withChange.sort((a, b) => b.changePct - a.changePct);

    const gainers = withChange.filter((a) => a.changePct > 0).slice(0, 3);
    const losers = withChange
      .filter((a) => a.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 3);

    if (gainers.length > 0 || losers.length > 0) {
      lines.push("*今日涨跌*");
      if (gainers.length > 0) {
        lines.push(
          `↑ ${gainers.map((g) => `${escapeMd(g.symbol)} +${formatNum(Math.abs(g.changePct))}%`).join(", ")}`,
        );
      }
      if (losers.length > 0) {
        lines.push(
          `↓ ${losers.map((l) => `${escapeMd(l.symbol)} -${formatNum(Math.abs(l.changePct))}%`).join(", ")}`,
        );
      }
      lines.push("");
    }
  }

  // --- Reminders ---
  const reminders: string[] = [];
  if (bootstrap.rebalanceStrategy.calendar.enabled) {
    const nextDay = bootstrap.rebalanceStrategy.calendar.dayOfMonth;
    const nextDate = computeNextRebalanceDate(now, nextDay);
    reminders.push(`下次定期再平衡: ${nextDate}`);
  }
  if (reminders.length > 0) {
    lines.push("*提醒*");
    for (const r of reminders) {
      lines.push(`• ${r}`);
    }
    lines.push("");
  }

  lines.push("_仅供参考，不构成投资建议。_");

  return lines.join("\n");
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "N/A";
}

function formatSignedPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${formatNum(pct)}%`;
}

function escapeMd(text: string): string {
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

function computeNextRebalanceDate(now: Date, dayOfMonth: number): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();

  if (today < dayOfMonth) {
    return `${String(m + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
  }
  const next = new Date(y, m + 1, 1);
  return `${String(next.getMonth() + 1).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}
