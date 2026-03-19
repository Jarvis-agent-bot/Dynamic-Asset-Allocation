import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { runAssistantTurn, isTelegramSenderAllowed } from "@/src/daa/chat/chatOrchestrator";
import { resolveSecret } from "@/src/daa/config/secretsManager";
import { sendTelegramMessage } from "@/src/daa/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    message_thread_id?: number;
    text?: string;
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  };
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const webhookSecret = await resolveSecret("telegram_webhook_secret");
    const providedSecret = normalizeText(req.headers.get("x-telegram-bot-api-secret-token"));
    if (webhookSecret && webhookSecret !== providedSecret) {
      return fail("UNAUTHORIZED", "telegram webhook secret mismatch", { status: 401 });
    }

    const update = await req.json() as TelegramUpdate;
    const message = update.message;
    const text = normalizeText(message?.text);
    const chatId = message?.chat?.id == null ? "" : String(message.chat.id).trim();
    const userId = message?.from?.id == null ? "" : String(message.from.id).trim();
    const threadId = message?.message_thread_id == null ? "" : String(message.message_thread_id).trim();
    if (!text || !chatId || !userId) {
      return ok({ ignored: true, reason: "message_missing" });
    }

    const allowed = await isTelegramSenderAllowed({ chatId, userId });
    if (!allowed) {
      return ok({ ignored: true, reason: "sender_not_allowed" });
    }

    const sessionKey = `telegram:${chatId}:${userId}:${threadId || "main"}`;
    const result = await runAssistantTurn({
      channel: "telegram",
      sessionKey,
      userText: text,
      title: message?.chat?.title || message?.from?.username || message?.from?.first_name || "Telegram 助手",
      participantId: message?.from?.username || [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ") || userId,
      externalChatId: chatId,
      externalUserId: userId,
      threadId: threadId || null,
      externalMessageId: message?.message_id == null ? null : String(message.message_id),
      allowExecution: true,
    });

    const botToken = await resolveSecret("telegram_bot_token");
    if (botToken) {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: result.assistantText,
        parseMode: null,
        replyToMessageId: message?.message_id == null ? null : String(message.message_id),
      });
    }

    return ok({
      handled: true,
      intentKind: result.intentKind,
      sessionId: result.session.sessionId,
      updateId: update.update_id || null,
    });
  });
}
