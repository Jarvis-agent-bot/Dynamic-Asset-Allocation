export type StrategyLabWarningPresentation = {
  valuationNotes: string[];
  orderNotes: string[];
  orderWarnings: string[];
  otherWarnings: string[];
};

function appendUnique(items: string[], item: string) {
  if (!items.includes(item)) items.push(item);
}

function formatAmount(value: number | null): string {
  return Number.isFinite(value) && value != null ? value.toFixed(2) : "";
}

function parseNumber(pattern: RegExp, input: string, groupIndex = 1): number | null {
  const match = pattern.exec(input);
  if (!match) return null;
  const parsed = Number(match[groupIndex]);
  return Number.isFinite(parsed) ? parsed : null;
}

function shortSymbolList(symbols: Set<string>): string {
  const list = [...symbols].sort();
  if (list.length <= 4) return list.join("、");
  return `${list.slice(0, 4).join("、")} 等 ${list.length} 个资产`;
}

function stripWarningPrefix(warning: string): string {
  return warning.replace(/^warning:\s*/i, "").trim();
}

export function summarizeStrategyLabWarnings(warnings: string[]): StrategyLabWarningPresentation {
  const valuationNotes: string[] = [];
  const orderNotes: string[] = [];
  const orderWarnings: string[] = [];
  const otherWarnings: string[] = [];

  let roundedOrderCount = 0;
  let suppressedOrderCount = 0;
  let minOrderNotional: number | null = null;
  const roundedSymbols = new Set<string>();

  for (const rawWarning of warnings) {
    const warning = String(rawWarning || "").trim();
    if (!warning) continue;

    if (warning.includes("交易日并集")) {
      const filledCount = parseNumber(/前向填充\s*(\d+)\s*个估值点/, warning);
      appendUnique(
        valuationNotes,
        `跨市场资产按交易日并集估值，非交易日使用上一根收盘价前向填充${filledCount != null ? `（${filledCount} 个估值点）` : ""}；下单仍只在各资产真实交易日执行。`,
      );
      continue;
    }

    if (warning.startsWith("已使用 ") && warning.includes("历史 FX 序列")) {
      appendUnique(valuationNotes, warning.endsWith("。") ? warning : `${warning}。`);
      continue;
    }

    if (warning.startsWith("FX 非交易日用上一根汇率前向填充")) {
      const filledCount = parseNumber(/前向填充\s*(\d+)\s*个估值点/, warning);
      appendUnique(
        valuationNotes,
        `FX 非交易日使用上一根汇率前向填充${filledCount != null ? `（${filledCount} 个估值点）` : ""}。`,
      );
      continue;
    }

    const roundedMatch = /^warning:\s*min order size:\s*(BUY|SELL)\s+(.+?)\s+rounded\s+/i.exec(warning);
    if (roundedMatch) {
      roundedOrderCount += 1;
      roundedSymbols.add(roundedMatch[2]);
      minOrderNotional ??= parseNumber(/minOrderNotional=(\d+(?:\.\d+)?)/i, warning);
      continue;
    }

    const moreRoundedCount = parseNumber(/^warning:\s*min order size:\s*(\d+)\s+more rounded/i, warning);
    if (moreRoundedCount != null) {
      roundedOrderCount += moreRoundedCount;
      minOrderNotional ??= parseNumber(/minOrderNotional=(\d+(?:\.\d+)?)/i, warning);
      continue;
    }

    if (/^warning:\s*min order size:\s*suppressed\s+/i.test(warning)) {
      suppressedOrderCount += 1;
      minOrderNotional ??= parseNumber(/minOrderNotional=(\d+(?:\.\d+)?)/i, warning);
      continue;
    }

    const moreSuppressedCount = parseNumber(/^warning:\s*min order size:\s*(\d+)\s+more suppressed/i, warning);
    if (moreSuppressedCount != null) {
      suppressedOrderCount += moreSuppressedCount;
      minOrderNotional ??= parseNumber(/minOrderNotional=(\d+(?:\.\d+)?)/i, warning);
      continue;
    }

    const cashMatch = /^warning:\s*insufficient cash for minOrderNotional=(\d+(?:\.\d+)?);\s*cashAvail=(\d+(?:\.\d+)?)/i.exec(warning);
    if (cashMatch) {
      const minNotional = Number(cashMatch[1]);
      const cashAvail = Number(cashMatch[2]);
      minOrderNotional ??= Number.isFinite(minNotional) ? minNotional : null;
      appendUnique(
        orderWarnings,
        `部分买入因可用现金不足且未达到最小下单额被跳过，回测结果可能存在目标偏离${Number.isFinite(cashAvail) ? `；当前可用现金约 ${cashAvail.toFixed(2)}。` : "。"}`,
      );
      continue;
    }

    const blockedMatch = /^warning:\s*minOrderNotional=(\d+(?:\.\d+)?) blocks all trades;\s*maxAbsDeltaNotional=(\d+(?:\.\d+)?)(?:\s+\(symbol=(.+?)\))?/i.exec(warning);
    if (blockedMatch) {
      appendUnique(
        orderWarnings,
        `最小下单额 ${Number(blockedMatch[1]).toFixed(2)} 阻止了本次调仓；最大偏离订单约 ${Number(blockedMatch[2]).toFixed(2)}${blockedMatch[3] ? `（${blockedMatch[3]}）` : ""}，仍低于门槛。`,
      );
      continue;
    }

    const constraintMatch = /^warning:\s*constraints\.(maxIn|maxOut)=(\d+(?:\.\d+)?)\s*<\s*minOrderNotional=(\d+(?:\.\d+)?);\s*(BUY|SELL) orders may be suppressed/i.exec(warning);
    if (constraintMatch) {
      const sideText = constraintMatch[4].toUpperCase() === "BUY" ? "买入" : "卖出";
      appendUnique(
        orderWarnings,
        `单笔${sideText}上限 ${Number(constraintMatch[2]).toFixed(2)} 低于最小下单额 ${Number(constraintMatch[3]).toFixed(2)}，部分${sideText}订单可能被压掉。`,
      );
      continue;
    }

    appendUnique(otherWarnings, stripWarningPrefix(warning));
  }

  if (roundedOrderCount > 0) {
    const minOrderText = minOrderNotional != null ? ` ${formatAmount(minOrderNotional)}` : "";
    const symbolText = roundedSymbols.size > 0 ? `涉及 ${shortSymbolList(roundedSymbols)}。` : "";
    appendUnique(
      orderNotes,
      `有 ${roundedOrderCount} 笔调仓因最小下单额${minOrderText} 按下单步长向下取整，少量尾差未执行。${symbolText}`,
    );
  }

  if (suppressedOrderCount > 0) {
    const minOrderText = minOrderNotional != null ? ` ${formatAmount(minOrderNotional)}` : "";
    appendUnique(orderWarnings, `有 ${suppressedOrderCount} 个候选订单低于最小下单额${minOrderText}，已在回测中跳过。`);
  }

  return {
    valuationNotes,
    orderNotes,
    orderWarnings,
    otherWarnings,
  };
}
