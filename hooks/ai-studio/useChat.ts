"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Attachment,
  type Conversation,
  type StoredMessage,
  deleteConversation as dbDelete,
  getAllConversations,
  newId,
  saveConversation,
  titleFromText,
} from "@/lib/ai-studio/storage/db";
import { streamChatClient } from "@/lib/ai-studio/chat/streamClient";
import { type ChatSettings, DEFAULT_SETTINGS } from "@/lib/ai-studio/chat/settings";
import { conversationChatRequest,serializeChatRequest } from "@/lib/ai-studio/chat/outgoing-request";
import { readChatImport } from "@/lib/ai-studio/storage/import";

/**
 * Orchestrates conversations: IndexedDB persistence, streaming sends,
 * stop / regenerate / edit-and-resend.
 */
export function useChat(
  selectedModelId: string | null,
  settings: ChatSettings = DEFAULT_SETTINGS,
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const importingRef = useRef(false);

  useEffect(()=>()=>{abortRef.current?.abort();},[]);

  // Latest settings without re-creating stream callbacks.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    getAllConversations().then(setConversations).catch(err => setError(`History could not be loaded: ${String(err)}`));
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  const persist = useCallback((conv: Conversation) => {
    saveConversation(conv)
      .then(() =>
        setConversations((prev) =>
          [conv, ...prev.filter((c) => c.id !== conv.id)].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        ),
      )
      .catch((err) => setError(`Save failed: ${String(err)}`));
  }, []);

  const runStream = useCallback(
    async (conv: Conversation, history: StoredMessage[]) => {
      const request = conversationChatRequest(conv.modelId,history,settingsRef.current);
      try { serializeChatRequest(request); }
      catch (err) { setError(err instanceof Error ? err.message : "Check your chat before sending."); return; }
      const assistant: StoredMessage = {
        id: newId(),
        role: "assistant",
        content: "",
        model: conv.modelId,
        createdAt: Date.now(),
      };
      setMessages([...history, assistant]);
      setStreamingId(assistant.id);
      setBusy(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      let content = "";
      let reasoning = "";
      let completionTokens: number | undefined;

      try {
        const result = await streamChatClient({
          ...request,
          signal: controller.signal,
          onDelta: (d) => {
            if (d.reasoning) reasoning += d.reasoning;
            if (d.content) content += d.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistant.id ? { ...m, content, reasoning } : m,
              ),
            );
          },
        });
        completionTokens = result.completionTokens;
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Generation failed");
        }
      } finally {
        const finalHistory: StoredMessage[] = [
          ...history,
          {
            ...assistant,
            content,
            reasoning,
            tokens: completionTokens,
          },
        ];
        setMessages(finalHistory);
        setStreamingId(null);
        setBusy(false);
        abortRef.current = null;
        persist({
          ...conv,
          messages: finalHistory,
          updatedAt: Date.now(),
        });
      }
    },
    [persist],
  );

  const send = useCallback(
    (text: string, attachments: Attachment[] = []) => {
      if (!selectedModelId || busy || abortRef.current || importingRef.current) return false;
      const userMsg: StoredMessage = {
        id: newId(),
        role: "user",
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        createdAt: Date.now(),
      };

      let conv = activeConversation;
      if (!conv) {
        const now = Date.now();
        conv = {
          id: newId(),
          title: titleFromText(text),
          modelId: selectedModelId,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const history = [...conv.messages, userMsg];
      try { serializeChatRequest(conversationChatRequest(selectedModelId,history,settingsRef.current)); }
      catch (err) { setError(err instanceof Error ? err.message : "Check your chat before sending."); return false; }
      const updated: Conversation = {
        ...conv,
        modelId: selectedModelId,
        title: conv.messages.length === 0 ? titleFromText(text) : conv.title,
        messages: history,
        updatedAt: Date.now(),
      };
      setActiveId(conv.id);
      persist(updated);
      void runStream(updated, history);
      return true;
    },
    [activeConversation, busy, persist, runStream, selectedModelId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(() => {
    if (!activeConversation || busy || abortRef.current || importingRef.current) return;
    let lastUserIdx = -1;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      if (activeConversation.messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    void runStream({...activeConversation,modelId:selectedModelId??activeConversation.modelId}, activeConversation.messages.slice(0, lastUserIdx + 1));
  }, [activeConversation, busy, runStream,selectedModelId]);

  /** Removes the message (and everything after); returns its text for prefill. */
  const editMessage = useCallback(
    (target: StoredMessage): string | null => {
      if (!activeConversation || busy || abortRef.current || importingRef.current) return null;
      const idx = activeConversation.messages.findIndex((m) => m.id === target.id);
      if (idx === -1) return null;
      const kept = activeConversation.messages.slice(0, idx);
      setMessages(kept);
      persist({ ...activeConversation, messages: kept, updatedAt: Date.now() });
      return target.content;
    },
    [activeConversation, busy, persist],
  );

  const select = useCallback((id: string) => {
    if(busy||abortRef.current||importingRef.current){setError("Wait for the current action or stop the reply before switching chats.");return;}
    if (id === "") {
      setActiveId(null);
      setMessages([]);
      return;
    }
    getAllConversations().then((all) => {
      const conv = all.find((c) => c.id === id);
      if (conv) {
        setActiveId(conv.id);
        setMessages(conv.messages);
        setConversations(all);
      }
    }).catch(err => setError(`Chat could not be opened: ${String(err)}`));
  }, [busy]);

  const remove = useCallback(
    (id: string) => {
      if(busy||abortRef.current||importingRef.current){setError("Wait for the current action or stop the reply before removing a chat.");return;}
      dbDelete(id)
        .then(() => setConversations((prev) => prev.filter((c) => c.id !== id)))
        .then(() => {
          if (id === activeId) {
            setActiveId(null);
            setMessages([]);
          }
        })
        .catch(err => setError(`Chat could not be deleted: ${String(err)}`));
    },
    [activeId,busy],
  );

  const importChat = useCallback(async (text: string) => {
    if (busy || abortRef.current || importingRef.current) throw Error("Wait for the current action or stop the reply before importing a chat.");
    const conversation = readChatImport(text);
    importingRef.current = true;
    setBusy(true);
    try {
      await saveConversation(conversation);
      setConversations(previous => [conversation, ...previous]);
      setActiveId(conversation.id);
      setMessages(conversation.messages);
      setError(null);
    } finally {
      importingRef.current = false;
      setBusy(false);
    }
  }, [busy]);

  return {
    conversations,
    activeId,
    messages,
    busy,
    streamingId,
    error,
    send,
    stop,
    regenerate,
    editMessage,
    select,
    remove,
    importChat,
  };
}
