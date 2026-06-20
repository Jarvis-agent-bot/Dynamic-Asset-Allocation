import { createHash } from "node:crypto";

import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { runIdempotentAccountScopedCronJob } from "@/src/daa/cron/accountCronScope";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { resolvePolicyConfig } from "@/src/daa/modules/policy-engine/policyConfig";
import { getZonedYmd, normalizeTimeZoneOrUtc } from "@/src/daa/modules/workbench/reviewSchedule";

type RiskAutopilotSource = "cron_drift_check";

export type RiskAutopilotTrigger = {
  symbol: string;
  triggerType: "stop_loss" | "take_profit";
};

function normalizeRiskTrigger(trigger: RiskAutopilotTrigger): string {
  const symbol = String(trigger.symbol || "").trim().toUpperCase();
  const triggerType = trigger.triggerType === "take_profit" ? "take_profit" : "stop_loss";
  return `${symbol}:${triggerType}`;
}

export function buildRiskAutopilotDailyKey(input: {
  now?: Date;
  timeZone: string;
  triggers: RiskAutopilotTrigger[];
}): string {
  const now = input.now ?? new Date();
  const zoned = getZonedYmd(now, normalizeTimeZoneOrUtc(input.timeZone));
  const dayKey = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;
  const normalizedTriggers = [...new Set(input.triggers.map(normalizeRiskTrigger).filter((item) => !item.startsWith(":")))]
    .sort();
  const digest = createHash("sha256").update(normalizedTriggers.join("|")).digest("hex").slice(0, 16);
  return `cron_risk_autopilot:${dayKey}:${digest}`;
}

export async function runRiskAutopilotDaily(input: {
  req: Request;
  source: RiskAutopilotSource;
  reason: string;
  triggers: RiskAutopilotTrigger[];
}): Promise<{
  attempted: boolean;
  skipped: boolean;
  reason: string | null;
  runId: string | null;
  cycleId: string | null;
  proposalCount: number;
  idempotencyKey: string;
  jobId: string;
  requestId: string | null;
}> {
  const system = await getDaaSystemConfig();
  const policy = resolvePolicyConfig(system.config);
  const timeZone = normalizeTimeZoneOrUtc(policy.review.timezone);
  const dailyKey = buildRiskAutopilotDailyKey({
    timeZone,
    triggers: input.triggers,
  });
  const idempotencyKey = `${getDaaAccountScopeId()}:${dailyKey}`;
  const affectedSymbols = [...new Set(input.triggers.map((trigger) => String(trigger.symbol || "").trim()).filter(Boolean))];

  const execution = await runIdempotentAccountScopedCronJob<Record<string, unknown>>({
    req: input.req,
    jobType: "cron_risk_autopilot",
    triggerSource: input.source,
    idempotencyKey,
    duplicateWindowMinutes: 36 * 60,
    duplicateReason: "risk autopilot already reviewed these triggers today",
    summarize: (result) => ({
      skipped: result.skipped,
      reason: result.reason,
      runId: (result.cognitiveRun as { runId?: unknown } | undefined)?.runId ?? null,
      cycleId: (result.rebalance as { cycleId?: unknown } | undefined)?.cycleId ?? null,
      proposalCount: (result.rebalance as { proposalCount?: unknown } | undefined)?.proposalCount ?? 0,
    }),
    handler: async () => runAutopilotLoop({
      source: input.source,
      reason: input.reason,
      affectedSymbols,
    }) as unknown as Record<string, unknown>,
  });

  const duplicateOf = (execution as { duplicateOf?: unknown }).duplicateOf;
  if (duplicateOf) {
    return {
      attempted: false,
      skipped: true,
      reason: String(execution.reason || "risk autopilot already reviewed these triggers today"),
      runId: null,
      cycleId: null,
      proposalCount: 0,
      idempotencyKey,
      jobId: String(execution.jobId || ""),
      requestId: typeof execution.requestId === "string" ? execution.requestId : null,
    };
  }

  const cognitiveRun = execution.cognitiveRun as { runId?: unknown } | undefined;
  const rebalance = execution.rebalance as { cycleId?: unknown; proposalCount?: unknown; reason?: unknown } | undefined;
  return {
    attempted: true,
    skipped: Boolean(execution.skipped),
    reason: typeof execution.reason === "string"
      ? execution.reason
      : typeof rebalance?.reason === "string"
        ? rebalance.reason
        : null,
    runId: typeof cognitiveRun?.runId === "string" ? cognitiveRun.runId : null,
    cycleId: typeof rebalance?.cycleId === "string" ? rebalance.cycleId : null,
    proposalCount: Math.max(0, Math.trunc(Number(rebalance?.proposalCount) || 0)),
    idempotencyKey,
    jobId: String(execution.jobId || ""),
    requestId: typeof execution.requestId === "string" ? execution.requestId : null,
  };
}
