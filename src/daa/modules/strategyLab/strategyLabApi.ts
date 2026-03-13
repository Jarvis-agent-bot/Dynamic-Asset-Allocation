import { requestData } from "@/src/daa/api/client";

import type {
  StrategyLabRunInput,
  StrategyLabRunResult,
  StrategyLabWritebackInput,
  StrategyLabWritebackResult,
} from "./strategyLabContracts";

export async function runStrategyLabApi(input: StrategyLabRunInput): Promise<StrategyLabRunResult> {
  return requestData<StrategyLabRunResult>("/api/daa/strategy-lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function writeStrategyLabTargetWeightsApi(input: StrategyLabWritebackInput): Promise<StrategyLabWritebackResult> {
  return requestData<StrategyLabWritebackResult>("/api/daa/strategy-lab/writeback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
