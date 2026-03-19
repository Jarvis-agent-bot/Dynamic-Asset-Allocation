import { requestData } from "@/src/daa/api/client";

import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";

export async function getAssistantSessions(): Promise<{
  session: DaaChatSession | null;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
}> {
  return requestData("/api/daa/chat/sessions", {
    method: "GET",
    cache: "no-store",
  });
}

export async function sendAssistantMessage(text: string): Promise<{
  session: DaaChatSession | null;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
  reply: {
    intentKind: string;
    text: string;
  };
}> {
  return requestData("/api/daa/chat/messages", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
}
