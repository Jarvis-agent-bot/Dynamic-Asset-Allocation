import { resolveSecret } from "@/src/daa/config/secretsManager";

export async function sendTelegramMessage(opts: {
  botToken: string;
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown";
}): Promise<boolean> {
  const botToken = String(opts.botToken || "").trim();
  const chatId = String(opts.chatId || "").trim();
  const text = String(opts.text || "").trim();
  if (!botToken || !chatId || !text) return false;

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode || "Markdown",
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTelegramByEnv(message: string): Promise<boolean> {
  const botToken = await resolveSecret("telegram_bot_token");
  const chatId = await resolveSecret("telegram_chat_id");
  if (!botToken || !chatId) return false;
  return sendTelegramMessage({ botToken, chatId, text: message });
}
