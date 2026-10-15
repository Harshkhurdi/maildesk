"use client";

import type { FreeModel } from "@/lib/ai-studio/openrouter/types";

interface ModelPickerProps {
  models: FreeModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatContext(n: number): string {
  if (!n) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/**
 * Dropdown of FREE models only — the server already filtered to zero-cost
 * models, so nothing paid can ever appear here.
 */
export function ModelPicker({ models, selectedId, onSelect }: ModelPickerProps) {
  const selected = models.find((m) => m.id === selectedId);

  return (
    <div className="group relative">
      <button
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-medium text-ink transition-colors hover:bg-hover"
        aria-haspopup="listbox"
      >
        <span className="max-w-[220px] truncate sm:max-w-none">
          {selected ? selected.name : models.length > 0 ? "Select a model" : "Loading models…"}
        </span>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          free
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-secondary">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        role="listbox"
        className="invisible absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[340px] overflow-y-auto rounded-xl border border-edge bg-sidebar p-1.5 opacity-0 shadow-xl transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {models.length === 0 && (
          <p className="px-3 py-4 text-sm text-ink-secondary">
            No free models available right now.
          </p>
        )}
        {models.map((model) => (
          <button
            key={model.id}
            role="option"
            aria-selected={model.id === selectedId}
            onClick={() => onSelect(model.id)}
            className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
              model.id === selectedId ? "bg-hover" : "hover:bg-hover"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{model.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {model.vision && (
                  <span title="Vision: accepts images" className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    vision
                  </span>
                )}
                {model.reasoning && (
                  <span title="Reasoning-capable" className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    reason
                  </span>
                )}
                <span className="text-xs text-ink-secondary">{formatContext(model.contextLength)}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}