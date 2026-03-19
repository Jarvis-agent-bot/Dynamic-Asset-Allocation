"use client";

import { useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "@/src/daa/api/client";
import { getAssistantSessions, sendAssistantMessage } from "@/src/daa/chat/chatApi";
import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "@/src/daa/chat/chatTypes";

export function useAssistantChat() {
  const [session, setSession] = useState<DaaChatSession | null>(null);
  const [messages, setMessages] = useState<DaaChatMessage[]>([]);
  const [sessions, setSessions] = useState<DaaChatSessionPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAssistantSessions();
      setSession(data.session);
      setMessages(data.messages || []);
      setSessions(data.sessions || []);
    } catch (error_) {
      setError(getApiErrorMessage(error_));
    } finally {
      setLoading(false);
    }
  }, []);

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
      setSession(data.session);
      setMessages(data.messages || []);
      setSessions(data.sessions || []);
    } catch (error_) {
      setError(getApiErrorMessage(error_));
    } finally {
      setSending(false);
    }
  }, []);

  return {
    session,
    messages,
    sessions,
    loading,
    sending,
    error,
    refresh,
    send,
  };
}

export type AssistantChatModel = ReturnType<typeof useAssistantChat>;
