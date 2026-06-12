"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getApiErrorMessage } from "@/src/daa/api/client";
import { getAssistantSessions, sendAssistantMessage } from "@/src/daa/chat/chatApi";
import type { DaaAssistantConversationReadModel } from "@/src/daa/chat/chatConversationTypes";
import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "@/src/daa/chat/chatTypes";
import type { DaaAssistantThread } from "@/src/daa/chat/chatThreadTypes";

export function useAssistantChat() {
  const [conversation, setConversation] = useState<DaaAssistantConversationReadModel | null>(null);
  const [session, setSession] = useState<DaaChatSession | null>(null);
  const [messages, setMessages] = useState<DaaChatMessage[]>([]);
  const [sessions, setSessions] = useState<DaaChatSessionPreview[]>([]);
  const [threads, setThreads] = useState<DaaAssistantThread[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const applyPayload = useCallback((data: Awaited<ReturnType<typeof getAssistantSessions>>) => {
    setConversation(data.conversation);
    setSession(data.conversation?.selectedSession || data.session);
    setMessages(data.conversation?.messages || data.messages || []);
    setSessions(data.conversation?.sessions || data.sessions || []);
    setThreads(data.conversation?.threads || data.threads || []);
    selectedSessionIdRef.current = data.conversation?.selectedSessionId || data.session?.sessionId || null;
    setSelectedSessionId(data.conversation?.selectedSessionId || data.session?.sessionId || null);
  }, []);

  const refresh = useCallback(async (options?: {
    sessionId?: string | null;
  }) => {
    const targetSessionId = options?.sessionId ?? selectedSessionIdRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await getAssistantSessions({
        sessionId: targetSessionId,
      });
      applyPayload(data);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const send = useCallback(async (text: string) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      const data = await sendAssistantMessage(trimmed);
      applyPayload(data);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError));
    } finally {
      setSending(false);
    }
  }, [applyPayload]);

  const selectThread = useCallback(async (sessionId: string) => {
    if (!sessionId || sending) return;
    await refresh({
      sessionId,
    });
  }, [refresh, sending]);

  return {
    conversation,
    session,
    messages,
    sessions,
    threads,
    selectedSessionId,
    loading,
    sending,
    error,
    refresh,
    send,
    selectThread,
  };
}
