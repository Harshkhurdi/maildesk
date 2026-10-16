"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/ai-studio/Sidebar";
import { ModelPicker } from "@/components/ai-studio/ModelPicker";
import { Composer, type ComposerHandle } from "@/components/ai-studio/Composer";
import { EmptyState } from "@/components/ai-studio/EmptyState";
import { MessageList } from "@/components/ai-studio/MessageList";
import { useChat } from "@/hooks/ai-studio/useChat";
import { ImagesView } from "@/components/ai-studio/ImagesView";
import { SettingsBar } from "@/components/ai-studio/SettingsBar";
import {
  type ChatSettings,
  DEFAULT_SETTINGS,
} from "@/lib/ai-studio/chat/settings";
import type { FreeModel } from "@/lib/ai-studio/openrouter/types";
import { MAX_CHAT_IMPORT_BYTES } from "@/lib/ai-studio/storage/import";

type View = "chat" | "images";

export default function HomePage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [models, setModels] = useState<FreeModel[]>([]);
  const [configured,setConfigured]=useState(false);
  const [modelsLoading,setModelsLoading]=useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const chat = useChat(selectedId, settings);
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll while the user is already near the bottom.
  const nearBottomRef = useRef(true);

  // Restore settings once on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("maildesk-ai-settings");
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as ChatSettings) });
    } catch {
      /* corrupted or unavailable */
    }
  }, []);

  const updateSettings = useCallback((next: ChatSettings) => {
    setSettings(next);
    try {
      localStorage.setItem("maildesk-ai-settings", JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try{const dark=localStorage.getItem("maildesk-ai-theme")==="dark";shellRef.current?.classList.toggle("dark",dark);setIsDark(dark);}catch{}
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !shellRef.current!.classList.contains("dark");
    shellRef.current!.classList.toggle("dark", next);
    try {
      localStorage.setItem("maildesk-ai-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
    setIsDark(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/models");
        const json = (await res.json()) as { models?: FreeModel[]; error?: string; configured?:boolean };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setModels(json.models ?? []);
        setConfigured(!!json.configured);
        setModelsError(null);
        setSelectedId((prev) => prev ?? json.models?.[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setModelsError(err instanceof Error ? err.message : "Failed to load models");
      } finally { if(!cancelled)setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the newest message in view while streaming — but only if the
  // user hasn't scrolled up to read earlier context.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  // Jump back to the bottom when switching conversations.
  useEffect(() => {
    nearBottomRef.current = true;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [chat.activeId]);

  const selected = models.find((m) => m.id === selectedId) ?? null;
  const totalTokens = useMemo(
    () =>
      chat.conversations.reduce(
        (sum, c) => sum + c.messages.reduce((s, m) => s + (m.tokens ?? 0), 0),
        0,
      ),
    [chat.conversations],
  );

  // Export the active conversation as Markdown or JSON.
  const exportChat = useCallback(
    (format: "md" | "json") => {
      if (chat.messages.length === 0) return;
      const title =
        chat.conversations.find((c) => c.id === chat.activeId)?.title ?? "chat";
      let content: string;
      let filename: string;
      let mime: string;
      if (format === "json") {
        content = JSON.stringify(
          { title, model: chat.conversations.find(c => c.id === chat.activeId)?.modelId ?? selectedId, exportedAt: new Date().toISOString(), messages: chat.messages },
          null,
          2,
        );
        filename = `${title}.json`;
        mime = "application/json";
      } else {
        const lines = chat.messages.map((m) => {
          const who = m.role === "user" ? "🧑 You" : `🤖 ${m.model ?? "AI"}`;
          const atts = (m.attachments ?? [])
            .map((a) => `\n> [attached ${a.kind}: ${a.name}]`)
            .join("");
          return `### ${who}\n\n${m.content}${atts}`;
        });
        content = `# ${title}\n\n_Exported from AI Studio · ${new Date().toLocaleString()}_\n\n${lines.join("\n\n---\n\n")}\n`;
        filename = `${title}.md`;
        mime = "text/markdown";
      }
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(/[/\\?%*:|"<>]/g, "-");
      a.click();
      URL.revokeObjectURL(url);
    },
    [chat.messages, chat.conversations, chat.activeId, selectedId],
  );

  // Keyboard shortcuts: ⌘/Ctrl+Shift+O new chat · Esc stops streaming.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyO") {
        e.preventDefault();
        chat.select("");
      } else if (e.key === "Escape" && chat.busy) {
        chat.stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);

  return (
    <div id="ai-studio-shell" ref={shellRef} className="ai-studio-shell"><div className="ai-studio-hostbar"><a href="/">← Maildesk workspace</a><strong>AI Studio<span>Free models</span></strong><a href="/conversations">Calls & messages ↗</a></div><p className="ai-studio-privacy">Only messages and attachments you send here go to OpenRouter and its model providers. Chat history is saved in this browser.</p><div className="ai-studio-app flex min-h-0 flex-1 overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleTheme={toggleTheme}
        isDark={isDark}
        conversations={chat.conversations}
        activeId={chat.activeId}
        totalTokens={totalTokens}
        onSelect={chat.select}
        onDelete={chat.remove}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-ink hover:bg-hover md:hidden"
            aria-label="Open sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <ModelPicker models={models} selectedId={selectedId} onSelect={setSelectedId} />
          {view === "chat" && <>
            <button disabled={chat.busy || importing} onClick={() => importInput.current?.click()} title="Import an AI Studio JSON export as a new local chat" className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-hover hover:text-ink disabled:opacity-40">{importing ? "Importing…" : "↑ Import JSON"}</button>
            <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import AI chat JSON" hidden onChange={async event => {
              const file = event.target.files?.[0]; event.target.value = "";
              if (!file) return;
              setImporting(true); setImportStatus("");
              try {
                if (file.size > MAX_CHAT_IMPORT_BYTES) throw Error("Choose an AI Studio JSON export smaller than 10 MB.");
                await chat.importChat(await file.text());
                setImportStatus("Chat imported as a new copy in this browser. Nothing was sent to an AI provider.");
              } catch (error) { setImportStatus(error instanceof Error ? error.message : "Chat import failed. Your existing chats were kept."); }
              finally { setImporting(false); }
            }} />
          </>}

          {/* View switch */}
          <div className="ml-2 flex rounded-full border border-edge p-0.5 text-xs">
            {(["chat", "images"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 capitalize transition-colors ${
                  view === v ? "bg-accent text-white" : "text-ink-secondary hover:text-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {modelsError && (
            <span className="ml-auto hidden truncate text-xs text-red-500 sm:block" title={modelsError}>
              ⚠ {modelsError}
            </span>
          )}

          {/* Export current conversation */}
          {view === "chat" && chat.messages.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => exportChat("md")}
                title="Export as Markdown"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-hover hover:text-ink"
              >
                ↓ MD
              </button>
              <button
                onClick={() => exportChat("json")}
                title="Export as JSON"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-hover hover:text-ink"
              >
                ↓ JSON
              </button>
            </div>
          )}
        </header>
        {importStatus && <p className="mx-auto w-full max-w-3xl px-6 pb-1 text-xs text-ink-secondary" role="status">{importStatus}</p>}

        {!modelsLoading&&!configured&&<div className="ai-studio-setup" role="status">AI setup is incomplete. Add the OpenRouter key in the site’s server settings to enable messages.</div>}
        {modelsError&&<p className="ai-studio-setup" role="alert">{modelsError} <button onClick={()=>location.reload()}>Try again</button></p>}
        {view === "images" ? (
          <ImagesView />
        ) : (
          <>
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            nearBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex flex-1 flex-col overflow-y-auto"
        >
              {chat.messages.length === 0 ? (
                !modelsLoading && models.length > 0 ? (
                  <EmptyState
                    modelName={selected?.name ?? null}
                    onSuggestion={(text) => composerRef.current?.setValue(text)}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-ink-secondary">
                    {modelsLoading?"Loading free models…":modelsError??"No free chat models are available right now."}
                  </div>
                )
              ) : (
                <MessageList
                  messages={chat.messages}
                  streamingId={chat.streamingId}
                  onRegenerate={chat.regenerate}
                  onEdit={(m) => {
                    const text = chat.editMessage(m);
                    if (text !== null) composerRef.current?.setValue(text);
                  }}
                />
              )}
            </div>

            {chat.error && (
              <p className="mx-auto w-full max-w-3xl px-6 pb-1 text-xs text-red-500" role="alert">
                ⚠ {chat.error}
              </p>
            )}

            <div className="pt-1">
              <SettingsBar settings={settings} onChange={updateSettings} />
              <Composer
                ref={composerRef}
                disabled={!configured||!selectedId||models.length===0}
                busy={chat.busy}
                visionReady={selected?.vision ?? false}
                hint="Verified free models · Enter to send · Shift+Enter for a new line"
                onSubmit={(text, attachments) => {
                  if (!selectedId && models.length > 0) setSelectedId(models[0].id);
                  return chat.send(text, attachments);
                }}
                onStop={chat.stop}
              />
            </div>
          </>
        )}
      </main>
    </div></div>
  );
}
