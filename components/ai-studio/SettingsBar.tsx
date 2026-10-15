"use client";

import { PRESETS, type ChatSettings } from "@/lib/ai-studio/chat/settings";

interface SettingsBarProps {
  settings: ChatSettings;
  onChange: (next: ChatSettings) => void;
}

/**
 * Collapsible generation settings: system-prompt presets, web search,
 * JSON mode and sampling controls. Persisted by the parent page.
 */
export function SettingsBar({ settings, onChange }: SettingsBarProps) {
  const set = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) =>
    onChange({ ...settings, [key]: value });

  // Match a preset only when the prompt is exactly its text.
  const activePreset =
    PRESETS.find((p) => p.prompt === settings.systemPrompt)?.name ?? "custom";

  return (
    <details className="mx-auto w-full max-w-3xl px-4">
      <summary className="flex w-fit cursor-pointer select-none items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-ink-secondary transition-colors hover:bg-hover hover:text-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6" />
        </svg>
        Settings
        {(settings.jsonMode || settings.systemPrompt) && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
            active
          </span>
        )}
      </summary>

      <div className="mt-1 mb-2 space-y-3 rounded-2xl border border-edge bg-sidebar p-4 text-sm">
        {/* System prompt */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-secondary">
            System prompt
          </label>
          <select
            aria-label="Prompt preset"
            value={activePreset}
            onChange={(e) => {
              const preset = PRESETS.find((p) => p.name === e.target.value);
              if (preset) set("systemPrompt", preset.prompt);
            }}
            className="mb-2 rounded-lg border border-edge bg-composer px-2.5 py-1.5 text-sm text-ink outline-none"
          >
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
            {!PRESETS.some((p) => p.prompt === settings.systemPrompt) && (
              <option value="custom">Custom</option>
            )}
          </select>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
            aria-label="AI instructions"
            maxLength={100000}
            rows={2}
            placeholder="Optional instructions that apply to every reply…"
            className="w-full resize-none rounded-xl border border-edge bg-composer px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-secondary focus:border-accent"
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-ink">
            <input
              type="checkbox"
              checked={settings.jsonMode}
              onChange={(e) => set("jsonMode", e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            JSON mode
          </label>
        </div>

        {/* Sampling controls */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-ink">
            <span className="text-xs uppercase tracking-wide text-ink-secondary">Temp</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => set("temperature", Number(e.target.value))}
              className="w-32 accent-[var(--accent)]"
            />
            <span className="w-7 text-xs tabular-nums text-ink-secondary">
              {settings.temperature.toFixed(1)}
            </span>
          </label>
          <label className="flex items-center gap-2 text-ink">
            <span className="text-xs uppercase tracking-wide text-ink-secondary">Max tokens</span>
            <input
              type="number"
              min={16}
              max={32768}
              step={16}
              value={settings.maxTokens ?? ""}
              placeholder="model default"
              onChange={(e) =>
                set("maxTokens", e.target.value ? Number(e.target.value) : null)
              }
              className="w-28 rounded-lg border border-edge bg-composer px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-secondary focus:border-accent"
            />
          </label>
        </div>
      </div>
    </details>
  );
}