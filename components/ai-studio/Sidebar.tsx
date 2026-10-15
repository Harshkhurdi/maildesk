"use client";

import type { Conversation } from "@/lib/ai-studio/storage/db";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  isDark: boolean;
  conversations: Conversation[];
  activeId: string | null;
  totalTokens: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * ChatGPT-style left sidebar. Conversation list is wired up in Phase 2
 * (IndexedDB persistence); the shell, new-chat button and theme toggle
 * are functional from Phase 1.
 */
export function Sidebar({
  open,
  onClose,
  onToggleTheme,
  isDark,
  conversations,
  activeId,
  totalTokens,
  onSelect,
  onDelete,
}: SidebarProps) {
  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-sidebar transition-transform duration-200 md:relative md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-3">
          <span className="flex items-center gap-2 px-1 text-sm font-semibold tracking-tight text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3h6a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V6a3 3 0 0 0-3-3Z" />
              </svg>
            </span>
            AI Studio
          </span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-secondary hover:bg-hover md:hidden"
            aria-label="Close sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3">
          <button
            className="flex w-full items-center gap-2 rounded-xl border border-edge px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-hover"
            onClick={() => {
              onSelect("");
              onClose();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3">
          {conversations.length > 0 && (
            <p className="px-2 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-ink-secondary">
              Conversations
            </p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center rounded-lg transition-colors ${
                conv.id === activeId ? "bg-hover" : "hover:bg-hover"
              }`}
            >
              <button
                onClick={() => {
                  onSelect(conv.id);
                  onClose();
                }}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <span className="truncate text-sm text-ink">{conv.title}</span>
                <span className="shrink-0 text-[11px] text-ink-secondary group-hover:hidden">
                  {timeAgo(conv.updatedAt)}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                aria-label={`Delete ${conv.title}`}
                className="mr-1 hidden shrink-0 rounded-md p-1.5 text-ink-secondary hover:text-red-500 group-hover:block"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                </svg>
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="px-2 text-sm leading-relaxed text-ink-secondary/70">
              Your chats will appear here — saved privately in your browser.
            </p>
          )}
        </nav>

        <div className="border-t border-edge p-3">
          <button
            onClick={onToggleTheme}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink transition-colors hover:bg-hover"
          >
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
            {isDark ? "Light mode" : "Dark mode"}
          </button>
          <p className="mt-2 flex items-center gap-1.5 px-3 text-xs text-ink-secondary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Free models only — zero cost
          </p>
          {totalTokens > 0 && (
            <p className="mt-1 px-3 text-xs text-ink-secondary">
              ⚡ {totalTokens.toLocaleString()} tokens used
            </p>
          )}
        </div>
      </aside>
    </>
  );
}