"use client";

import { useState } from "react";
import type { StoredMessage } from "@/lib/ai-studio/storage/db";
import { Markdown } from "@/components/ai-studio/Markdown";

export interface MessageListProps {
  messages: StoredMessage[];
  streamingId: string | null;
  onRegenerate: () => void;
  onEdit: (message: StoredMessage) => void;
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-1.5 py-0.5 text-xs text-ink-secondary transition-colors hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? "✓ Copied" : "⧉ Copy"}
    </ActionButton>
  );
}

/** Markdown-stripped text of an assistant message for copying/export. */
function plainText(message: StoredMessage): string {
  return message.content;
}

export function MessageList({ messages, streamingId, onRegenerate, onEdit }: MessageListProps) {
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {messages.map((message, idx) => {
        const isUser = message.role === "user";
        const isStreaming = message.id === streamingId;
        const showActions = !isStreaming;

        return (
          <div key={message.id} className={`group mb-6 ${isUser ? "flex justify-end" : ""}`}>
            <div className={`max-w-[85%] ${isUser ? "" : "w-full"}`}>
              {/* Avatar row for assistant */}
              {!isUser && (
                <span className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3h6a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V6a3 3 0 0 0-3-3Z" />
                  </svg>
                </span>
              )}

              <div
                className={
                  isUser
                    ? "inline-block rounded-3xl bg-bubble px-4 py-2.5 text-[15px] leading-relaxed text-ink"
                    : "text-[15px] leading-relaxed text-ink"
                }
              >
                {isStreaming && !message.content && !message.reasoning ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-accent" />
                ) : isUser ? (
                  <>
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {message.attachments.map((a, i) =>
                          a.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={a.url}
                              alt={a.name}
                              className="max-h-48 rounded-xl border border-edge object-cover"
                            />
                          ) : (
                            <span
                              key={i}
                              className="flex items-center gap-1.5 rounded-lg bg-app px-2.5 py-1.5 text-xs text-ink-secondary"
                            >
                              📄 {a.name}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {message.content && (
                      <span className="whitespace-pre-wrap break-words">{message.content}</span>
                    )}
                  </>
                ) : (
                  <>
                    {message.reasoning && (
                      <details className="mb-3 rounded-xl border border-edge px-3 py-2">
                        <summary className="cursor-pointer select-none text-xs font-medium text-ink-secondary">
                          Thought process ({message.reasoning.length.toLocaleString()} chars)
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">
                          {message.reasoning}
                        </div>
                      </details>
                    )}
                    {message.content ? (
                      <Markdown text={message.content} />
                    ) : (
                      isStreaming && null
                    )}
                    {isStreaming && message.content && (
                      <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-accent align-middle" />
                    )}
                  </>
                )}
              </div>

              {/* Message actions */}
              {showActions && (
                <div
                  className={`mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isUser ? "justify-end" : ""
                  }`}
                >
                  <CopyMessageButton text={isUser ? message.content : plainText(message)} />
                  {isUser ? (
                    <ActionButton onClick={() => onEdit(message)}>✏️ Edit &amp; resend</ActionButton>
                  ) : (
                    <>
                      {idx === lastAssistantIdx && (
                        <ActionButton onClick={onRegenerate}>↻ Regenerate</ActionButton>
                      )}
                      {message.model && (
                        <span className="px-1.5 text-[11px] text-ink-secondary">
                          {message.model}
                          {message.tokens ? ` · ${message.tokens} tokens` : ""}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}