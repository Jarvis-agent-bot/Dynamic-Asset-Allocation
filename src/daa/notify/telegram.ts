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
  let botToken = String(process.env.TELEGRAM_BOT_TOKEN || process.env.DAA_TELEGRAM_BOT_TOKEN || "").trim();
  let chatId = String(process.env.TELEGRAM_CHAT_ID || process.env.DAA_TELEGRAM_CHAT_ID || "").trim();

  if (!botToken || !chatId) {
    try {
      const { resolveSecret } = await import("@/src/daa/config/secretsManager");
      if (!botToken) botToken = await resolveSecret("telegram_bot_token");
      if (!chatId) chatId = await resolveSecret("telegram_chat_id");
    } catch {
      // secretsManager not available
    }
  }

  if (!botToken || !chatId) return false;
  return sendTelegramMessage({ botToken, chatId, text: message });
}
