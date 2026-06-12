export type PriceSeriesInterval = "1d" | "1h";
export type RangeKey = "1D" | "5D" | "1M" | "3M" | "1Y";
export type IndicatorKey = "ma" | "ema" | "boll" | "volume" | "macd" | "kdj";

export const TIME_RANGES: { key: RangeKey; label: string; days: number; interval: PriceSeriesInterval }[] = [
  { key: "1D", label: "1日", days: 2, interval: "1h" },
  { key: "5D", label: "5日", days: 10, interval: "1h" },
  { key: "1M", label: "1月", days: 30, interval: "1d" },
  { key: "3M", label: "3月", days: 90, interval: "1d" },
  { key: "1Y", label: "1年", days: 365, interval: "1d" },
];

export const INDICATOR_LABELS: { key: IndicatorKey; label: string }[] = [
  { key: "ma", label: "MA" },
  { key: "ema", label: "EMA" },
  { key: "boll", label: "BOLL" },
  { key: "volume", label: "VOL" },
  { key: "macd", label: "MACD" },
  { key: "kdj", label: "KDJ" },
];

export const KLINE_CHART_THEME = {
  bg: "#050607",
  panel: "#090d10",
  panelSoft: "#0d1216",
  grid: "rgba(107, 114, 128, 0.12)",
  gridStrong: "rgba(148, 163, 184, 0.18)",
  text: "#d6dde5",
  muted: "#8a939f",
  faint: "#59636f",
  up: "#00c076",
  down: "#f84960",
  amber: "#f7b500",
  cyan: "#2bb6ff",
  movingAverageMid: "#d957ff",
  purple: "#8b7cf6",
  volumeUp: "rgba(0, 192, 118, 0.42)",
  volumeDown: "rgba(248, 73, 96, 0.42)",
  histogramUp: "rgba(0, 192, 118, 0.7)",
  histogramDown: "rgba(248, 73, 96, 0.7)",
  paneSeparatorHover: "rgba(43, 182, 255, 0.45)",
  crosshairLine: "rgba(214, 221, 229, 0.26)",
  priceLine: "rgba(214, 221, 229, 0.42)",
  emaFast: "#00d1ff",
  emaSlow: "#ff9f43",
  bollBand: "rgba(139, 124, 246, 0.9)",
  bollMiddle: "rgba(247, 181, 0, 0.85)",
} as const;

export const MA_LINES = [
  { key: "ma5", period: 5, label: "MA5", color: KLINE_CHART_THEME.amber },
  { key: "ma10", period: 10, label: "MA10", color: KLINE_CHART_THEME.movingAverageMid },
  { key: "ma20", period: 20, label: "MA20", color: KLINE_CHART_THEME.cyan },
  { key: "ma60", period: 60, label: "MA60", color: KLINE_CHART_THEME.purple },
] as const;

export const KLINE_TERMINAL_CLASSNAMES = {
  root: "bg-[#050607] text-[#d6dde5]",
  header: "border-[#161b20] bg-[#090d10]",
  subHeaderBorder: "border-[#111820]",
  panel: "border-[#1a222a] bg-[#090d10]/95 ring-1 ring-black/20",
  badge: "rounded-[var(--radius-sm)] border border-[#202832] bg-[#050607]",
  text: "text-[#d6dde5]",
  muted: "text-[#8a939f]",
  faint: "text-[#59636f]",
  subtleValue: "text-[#b8c0ca]",
  positive: "text-[#00c076]",
  negative: "text-[#f84960]",
  warning: "text-[#f7b500]",
  cyan: "text-[#2bb6ff]",
  movingAverageMid: "text-[#d957ff]",
  purple: "text-[#8b7cf6]",
  controlActive: "bg-[#1a222a] text-white",
  controlIdle: "text-[#8a939f] hover:bg-[#10161b] hover:text-[#d6dde5]",
  indicatorActive: "bg-[#15202a] text-[#d6dde5]",
  indicatorIdle: "text-[#59636f] hover:bg-[#10161b] hover:text-[#8a939f]",
  statusHealthy: "border-[#123827] bg-[#061812] text-[#00c076]",
  statusWarning: "border-[#5a3a12] bg-[#1a1206] text-[#f7b500]",
  loadingOverlay: "bg-[#050607]/92",
} as const;
