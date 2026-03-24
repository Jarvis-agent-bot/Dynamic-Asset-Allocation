import { requestData } from "@/src/daa/api/client";

import type { DaaAssistantConversationReadModel } from "./chatConversationTypes";
import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";
import type { DaaAssistantThread } from "./chatThreadTypes";

export async function getAssistantSessions(options?: {
  sessionId?: string | null;
}): Promise<{
  session: DaaChatSession | null;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
  threads: DaaAssistantThread[];
  conversation: DaaAssistantConversationReadModel;
}> {
  const params = new URLSearchParams();
  if (options?.sessionId) params.set("sessionId", options.sessionId);
  const query = params.toString();
  return requestData(`/api/daa/chat/sessions${query ? `?${query}` : ""}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function sendAssistantMessage(text: string): Promise<{
  session: DaaChatSession | null;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
  threads: DaaAssistantThread[];
  conversation: DaaAssistantConversationReadModel;
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
