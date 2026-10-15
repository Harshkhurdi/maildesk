"use client";

import type { ChatMessageParam, StreamDelta } from "@/lib/ai-studio/openrouter/types";
import { serializeChatRequest } from "./outgoing-request";

export interface StreamChatClientOptions {
  model: string;
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
}

/**
 * Consumes the SSE stream from our /api/chat route and invokes `onDelta`
 * for every content/reasoning chunk. Resolves with the full assembled text.
 */
/** Resolves with the assembled reply and real token usage when reported. */
export async function streamChatClient(options: StreamChatClientOptions): Promise<{
  content: string;
  reasoning: string;
  finishReason: string | null;
  completionTokens?: number;
}> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: serializeChatRequest(options),
  });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let completionTokens: number | undefined;
  let completed = false;

  const handleFrame = (frame: string) => {
    for (const line of frame.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") { completed = true; return; }
      try {
        const parsed = JSON.parse(payload) as {
          error?: {message?:string};
          choices?: Array<{
            delta?: { content?: string | null; reasoning?: string | null };
            finish_reason?: string | null;
          }>;
          usage?: { completion_tokens?: number };
        };
        if(parsed.error)throw Error(parsed.error.message??"The AI provider interrupted this reply.");
        if (parsed.usage?.completion_tokens !== undefined) {
          completionTokens = parsed.usage.completion_tokens;
        }
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta: StreamDelta = {
          content: choice.delta?.content ?? undefined,
          reasoning: choice.delta?.reasoning ?? undefined,
          finish_reason: choice.finish_reason ?? undefined,
        };
        if (delta.content) content += delta.content;
        if (delta.reasoning) reasoning += delta.reasoning;
        if (delta.finish_reason) { finishReason = delta.finish_reason; completed = true; }
        options.onDelta(delta);
      } catch(e) {
        if(!(e instanceof SyntaxError))throw e;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer=buffer.replace(/\r\n/g,"\n");
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleFrame(frame);
    }
  }

  buffer += decoder.decode();
  if(buffer.trim())handleFrame(buffer);
  options.signal?.throwIfAborted();
  if(!completed)throw Error("The reply ended before it was complete. Your partial reply is kept; retry or choose another free model.");
  if(!content.trim()&&!reasoning.trim())throw Error("The model returned no answer. Try another free model.");
  return { content, reasoning, finishReason, completionTokens };
}
