import { appendDaaTriggerEvent } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeText } from "@/src/daa/utils/normalize";
import type { RebalanceTriggerSource } from "./workbenchTypes";

function buildTriggerEventIdempotencyKey(input: {
  triggerSource: RebalanceTriggerSource;
  triggerReason: string;
  cycleId?: string | null;
}): string {
  const source = normalizeText(input.triggerSource).toLowerCase() || "manual";
  const reason = normalizeText(input.triggerReason).toLowerCase().replace(/\s+/g, "_").slice(0, 80) || "na";
  if (input.cycleId) return `cycle:${normalizeText(input.cycleId)}`;
  const hourSlot = new Date().toISOString().slice(0, 13);
  return `evt:${source}:${reason}:${hourSlot}`;
}

export async function appendTriggerEventSafe(input: {
  triggerSource: RebalanceTriggerSource;
  triggerReason: string;
  cycleId?: string | null;
  status: "accepted" | "skipped" | "conflict";
  detailsJson?: Record<string, unknown>;
}) {
  try {
    await appendDaaTriggerEvent({
      idempotencyKey: buildTriggerEventIdempotencyKey({
        triggerSource: input.triggerSource,
        triggerReason: input.triggerReason,
        cycleId: input.cycleId,
      }),
      triggerSource: input.triggerSource,
      triggerReason: input.triggerReason,
      cycleId: input.cycleId,
      status: input.status,
      detailsJson: input.detailsJson || {},
    });
  } catch (err) {
    logSwallowed("triggerEvent.appendTriggerEvent", err);
  }
}
