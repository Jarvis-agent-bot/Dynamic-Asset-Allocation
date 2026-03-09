import { requestDataV1 } from "@/src/daa/api/clientV1";

import type {
  StrategyLabRunInputV1,
  StrategyLabRunResultV1,
  StrategyLabWritebackInputV1,
  StrategyLabWritebackResultV1,
} from "./strategyLabContractsV1";

export async function runStrategyLabApiV1(input: StrategyLabRunInputV1): Promise<StrategyLabRunResultV1> {
  return requestDataV1<StrategyLabRunResultV1>("/api/daa/strategy-lab/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function writeStrategyLabTargetWeightsApiV1(input: StrategyLabWritebackInputV1): Promise<StrategyLabWritebackResultV1> {
  return requestDataV1<StrategyLabWritebackResultV1>("/api/daa/strategy-lab/writeback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
