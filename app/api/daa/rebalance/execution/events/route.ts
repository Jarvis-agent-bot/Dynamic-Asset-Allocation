import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { sendTelegramByEnvV1 } from "@/src/daa/notify/telegramV1";
import { applyDaaExecutionEventsV1, getDaaNotificationConfigV1, type DaaExecutionEventInputV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type ApplyEventsRequestBodyV1 = {
  decisionId?: unknown;
  events?: unknown;
};

const EVENT_TYPES = new Set<DaaExecutionEventInputV1["type"]>(["submit", "cancel", "skip", "fill"]);

function normalizeEventInput(event: unknown): DaaExecutionEventInputV1 | null {
  if (!event || typeof event !== "object") return null;
  const row = event as Record<string, unknown>;

  const orderId = String(row.orderId || "").trim();
  const type = String(row.type || "").trim().toLowerCase() as DaaExecutionEventInputV1["type"];
  if (!orderId || !EVENT_TYPES.has(type)) return null;

  const normalized: DaaExecutionEventInputV1 = {
    orderId,
    type,
  };

  if (row.note != null) normalized.note = String(row.note);
  if (row.final != null) normalized.final = Boolean(row.final);
  if (row.ts != null) normalized.ts = String(row.ts);

  if (row.fillQty != null) normalized.fillQty = Number(row.fillQty);
  if (row.fillPrice != null) normalized.fillPrice = Number(row.fillPrice);
  if (row.fee != null) normalized.fee = Number(row.fee);

  return normalized;
}

function validateEventsInput(
  decisionId: string,
  eventsRaw: unknown,
): { ok: true; events: DaaExecutionEventInputV1[] } | { ok: false; message: string } {
  if (!decisionId) return { ok: false, message: "decisionId is required" };

  const events = Array.isArray(eventsRaw) ? eventsRaw : null;
  if (!events || !events.length) return { ok: false, message: "events must be a non-empty array" };
  if (events.length > 200) return { ok: false, message: "events length exceeds limit(200)" };

  const normalized: DaaExecutionEventInputV1[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = normalizeEventInput(events[i]);
    if (!event) return { ok: false, message: `invalid event at index ${i}` };

    if (event.type === "fill") {
      const fillQty = Number(event.fillQty);
      const fillPrice = Number(event.fillPrice);
      const fee = event.fee == null ? 0 : Number(event.fee);

      if (!Number.isFinite(fillQty) || fillQty <= 0) {
        return { ok: false, message: `fillQty must be > 0 at index ${i}` };
      }
      if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
        return { ok: false, message: `fillPrice must be > 0 at index ${i}` };
      }
      if (!Number.isFinite(fee) || fee < 0) {
        return { ok: false, message: `fee must be >= 0 at index ${i}` };
      }
      event.fillQty = fillQty;
      event.fillPrice = fillPrice;
      event.fee = fee;

      if (event.ts != null) {
        const ms = Date.parse(String(event.ts));
        if (!Number.isFinite(ms)) {
          return { ok: false, message: `ts must be a valid datetime at index ${i}` };
        }
      }
    } else {
      if (event.fillQty != null || event.fillPrice != null) {
        return { ok: false, message: `fillQty/fillPrice only allowed for fill event at index ${i}` };
      }
      if (event.fee != null && (!Number.isFinite(Number(event.fee)) || Number(event.fee) < 0)) {
        return { ok: false, message: `fee must be >= 0 at index ${i}` };
      }
    }

    normalized.push(event);
  }

  return { ok: true, events: normalized };
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<ApplyEventsRequestBodyV1>(req);
    const decisionId = String(body?.decisionId || "").trim();

    const checked = validateEventsInput(decisionId, body?.events);
    if (!checked.ok) {
      return failV1("VALIDATION_FAILED", checked.message, { status: 400 });
    }

    const result = await applyDaaExecutionEventsV1({
      decisionId,
      events: checked.events,
    });

    try {
      const notifyConfig = await getDaaNotificationConfigV1();
      if (notifyConfig.enabled && notifyConfig.notifyOnRebalance) {
        await sendTelegramByEnvV1(
          [
            "*DAA 交易执行事件已应用*",
            `Decision: ${result.decision.id}`,
            `状态: ${result.decision.status}`,
            `事件数: ${result.applied.length}`,
            `现金: ${result.account.cash.toFixed(2)} ${result.account.baseCurrency}`,
            `权益: ${result.equitySnapshot.totalEquity.toFixed(2)}`,
          ].join("\n"),
        );
      }
    } catch {
      // 通知失败不阻塞主流程
    }

    return okV1(result);
  });
}
