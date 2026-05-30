"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import { runBreakoutBacktest } from "@/src/daa/modules/strategyLab/breakoutLabApi";
import type {
  BreakoutLabRunParams,
  BreakoutLabRunResult,
} from "@/src/daa/modules/strategyLab/breakoutLabService";

function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultStartDate(yearsBack = 5): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsBack);
  return toLocalDateInputValue(d);
}

export type BreakoutConfigState = {
  assetsText: string; // 逗号/空格分隔的标的，如 "NVDA, AAPL, US::MSFT"
  startDate: string;
  endDate: string;
  initialCapital: number;
  riskPct: number;
  maxSlots: number;
  // 策略参数
  breakoutLookback: number;
  volMultiple: number;
  maFast: number;
  maSlow: number;
  maxExtensionPct: number;
  stopPct: number;
  rewardMultiple: number;
  useMaExit: boolean;
  exitMode: "ma" | "trailing" | "target";
  trailingPct: number; // 百分比形式
};

export const DEFAULT_BREAKOUT_CONFIG: BreakoutConfigState = {
  assetsText: "NVDA, AAPL, MSFT, GOOGL, META, AMZN, AMD, AVGO, MU, TSLA, PLTR, ORCL, SMH, QQQ, VOO",
  startDate: defaultStartDate(5),
  endDate: toLocalDateInputValue(new Date()),
  initialCapital: 100_000,
  riskPct: 1, // 百分比形式，提交时 /100
  maxSlots: 3,
  breakoutLookback: 20,
  volMultiple: 1.5,
  maFast: 20,
  maSlow: 50,
  maxExtensionPct: 20, // 百分比形式
  stopPct: 8, // 百分比形式
  rewardMultiple: 2,
  useMaExit: true,
  exitMode: "trailing", // 默认用跟踪止损（5y回测最优：+52.5% vs MA离场 +41.3%）
  trailingPct: 12, // 百分比形式
};

export interface UseBreakoutLabResult {
  config: BreakoutConfigState;
  setConfig: Dispatch<SetStateAction<BreakoutConfigState>>;
  running: boolean;
  result: BreakoutLabRunResult | null;
  error: string;
  run: () => Promise<void>;
  reset: () => void;
  canRun: boolean;
  parsedAssets: string[];
}

function parseAssets(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useBreakoutLab(): UseBreakoutLabResult {
  const [config, setConfig] = useState<BreakoutConfigState>(DEFAULT_BREAKOUT_CONFIG);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BreakoutLabRunResult | null>(null);
  const [error, setError] = useState("");

  const parsedAssets = parseAssets(config.assetsText);

  const run = useCallback(async () => {
    if (running) return;
    const assets = parseAssets(config.assetsText);
    if (assets.length === 0) {
      setError("请至少输入一个标的");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const params: BreakoutLabRunParams = {
        assets,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: config.initialCapital,
        riskPct: config.riskPct / 100,
        maxSlots: config.maxSlots,
        strategy: {
          breakoutLookback: config.breakoutLookback,
          volMultiple: config.volMultiple,
          maFast: config.maFast,
          maSlow: config.maSlow,
          maxExtensionPct: config.maxExtensionPct / 100,
          stopPct: config.stopPct / 100,
          rewardMultiple: config.rewardMultiple,
          useMaExit: config.useMaExit,
          exitMode: config.exitMode,
          trailingPct: config.trailingPct / 100,
        },
      };
      const res = await runBreakoutBacktest(params);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "回测执行失败");
    } finally {
      setRunning(false);
    }
  }, [running, config]);

  const reset = useCallback(() => {
    setResult(null);
    setError("");
  }, []);

  const canRun = !running && parsedAssets.length > 0;

  return { config, setConfig, running, result, error, run, reset, canRun, parsedAssets };
}
