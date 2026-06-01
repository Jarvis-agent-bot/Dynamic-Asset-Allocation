"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { runBreakoutBacktest } from "@/src/daa/modules/strategyLab/breakoutLabApi";
import type {
  BreakoutLabRunParams,
  BreakoutLabRunResult,
} from "@/src/daa/modules/strategyLab/breakoutLabService";
import type { StrategyLabDateDefaults } from "./strategyLabDateDefaults";

export type BreakoutConfigState = {
  assetsText: string; // 逗号/空格分隔的标的，如 "NVDA, AAPL, US::MSFT"
  startDate: string;
  endDate: string;
  initialCapital: number;
  baseCurrency: string;
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

function createDefaultBreakoutConfig(dateDefaults: StrategyLabDateDefaults): BreakoutConfigState {
  return {
    assetsText: "NVDA, AAPL, MSFT, GOOGL, META, AMZN, AMD, AVGO, MU, TSLA, PLTR, ORCL, SMH, QQQ, VOO",
    startDate: dateDefaults.breakoutStartDate,
    endDate: dateDefaults.breakoutEndDate,
    initialCapital: 100_000,
    baseCurrency: "USD",
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
}

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

export function useBreakoutLab(dateDefaults: StrategyLabDateDefaults): UseBreakoutLabResult {
  const [config, setConfig] = useState<BreakoutConfigState>(() => createDefaultBreakoutConfig(dateDefaults));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BreakoutLabRunResult | null>(null);
  const [error, setError] = useState("");

  const parsedAssets = parseAssets(config.assetsText);
  const runReqIdRef = useRef(0);

  const run = useCallback(async () => {
    if (running) return;
    const assets = parseAssets(config.assetsText);
    if (assets.length === 0) {
      setError("请至少输入一个标的");
      return;
    }
    if (config.maxSlots < 1) {
      setError("最大持仓数需 ≥ 1");
      return;
    }
    if (config.maFast >= config.maSlow) {
      setError("快线周期需小于慢线周期");
      return;
    }
    const reqId = ++runReqIdRef.current;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const params: BreakoutLabRunParams = {
        assets,
        startDate: config.startDate,
        endDate: config.endDate,
        initialCapital: config.initialCapital,
        baseCurrency: config.baseCurrency,
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
      if (reqId !== runReqIdRef.current) return;
      setResult(res);
    } catch (e) {
      if (reqId !== runReqIdRef.current) return;
      setError(e instanceof Error ? e.message : "回测执行失败");
    } finally {
      if (reqId === runReqIdRef.current) setRunning(false);
    }
  }, [running, config]);

  const reset = useCallback(() => {
    setResult(null);
    setError("");
  }, []);

  const canRun = !running && parsedAssets.length > 0;

  return { config, setConfig, running, result, error, run, reset, canRun, parsedAssets };
}
