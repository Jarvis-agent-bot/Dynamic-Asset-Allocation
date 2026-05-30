import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";

export function formatStrategyLabCurrencyTick(value: number, baseCurrency: string): string {
  return formatCurrency(value, baseCurrency);
}

export function formatStrategyLabCurrencyTooltipValue(
  value: number | null | undefined,
  baseCurrency: string,
): string {
  return formatCurrency(Number.isFinite(value) ? Number(value) : 0, baseCurrency);
}
