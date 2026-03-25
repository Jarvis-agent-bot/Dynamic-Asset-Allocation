import { timingSafeEqual, createHash } from "node:crypto";

import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseTelegramInboundUpdate } from "@/src/daa/chat/channelAdapters";
import { runAssistantTurn, isTelegramSenderAllowed } from "@/src/daa/chat/chatOrchestrator";
import { prepareTelegramAssistantSession } from "@/src/daa/chat/chatSessionService";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { sendTelegramMessage } from "@/src/daa/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 使用 SHA-256 哈希进行时序安全比较，避免侧信道攻击 */
function timingSafeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const webhookSecret = await resolveSecret("telegram_webhook_secret");
    const providedSecret = normalizeText(req.headers.get("x-telegram-bot-api-secret-token"));
    if (webhookSecret && !timingSafeCompare(webhookSecret, providedSecret)) {
      return fail("UNAUTHORIZED", "telegram webhook secret mismatch", { status: 401 });
    }

    const update = await req.json();
    const inbound = parseTelegramInboundUpdate(update);
    if (!inbound) {
      return ok({ ignored: true, reason: "message_missing" });
    }

    const allowed = await isTelegramSenderAllowed({ chatId: inbound.chatId, userId: inbound.userId });
    if (!allowed) {
      return ok({ ignored: true, reason: "sender_not_allowed" });
    }

    const { descriptor, session, duplicateMessage } = await prepareTelegramAssistantSession(inbound);
    if (duplicateMessage) {
      return ok({
        handled: true,
        duplicate: true,
        sessionId: session.sessionId,
        updateId: inbound.updateId,
      });
    }

    const result = await runAssistantTurn({
      ...descriptor,
      userText: inbound.text,
      externalMessageId: inbound.externalMessageId,
      allowExecution: true,
    });

    const botToken = await resolveSecret("telegram_bot_token");
    if (botToken) {
      await sendTelegramMessage({
        botToken,
        chatId: inbound.chatId,
        text: result.assistantText,
        parseMode: null,
        replyToMessageId: inbound.replyToMessageId,
      });
    }

    return ok({
      handled: true,
      intentKind: result.intentKind,
      sessionId: result.session.sessionId,
      updateId: inbound.updateId,
    });
  });
}
