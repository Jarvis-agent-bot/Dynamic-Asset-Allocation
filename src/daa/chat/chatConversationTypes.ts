import type { DaaAssistantThread } from "./chatThreadTypes";
import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";

type DaaAssistantConversationStats = {
  messageCount: number;
  threadCount: number;
  webThreadCount: number;
  telegramThreadCount: number;
  latestMessageAt: string | null;
};

export type DaaAssistantConversationReadModel = {
  activeSession: DaaChatSession | null;
  selectedSession: DaaChatSession | null;
  activeThread: DaaAssistantThread | null;
  selectedThread: DaaAssistantThread | null;
  selectedSessionId: string | null;
  isPreviewingOtherThread: boolean;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
  threads: DaaAssistantThread[];
  stats: DaaAssistantConversationStats;
};
