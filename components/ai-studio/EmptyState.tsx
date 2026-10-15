"use client";

interface EmptyStateProps {
  modelName: string | null;
  onSuggestion?: (text: string) => void;
}

/** Welcome screen shown when a conversation is empty. */
export function EmptyState({ modelName, onSuggestion }: EmptyStateProps) {
  const suggestions = [
    "Turn my rough notes into a simple action plan",
    "Help me structure a weekly project update",
    "Draft a friendly follow-up email after an interview",
    "Give me 5 dinner ideas from eggs, rice and spinach",
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3h6a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V6a3 3 0 0 0-3-3Z" />
        </svg>
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">What can I help with?</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        {modelName
          ? `Chatting with ${modelName} — a verified free model.`
          : "Powered exclusively by free OpenRouter models."}
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            className="rounded-xl border border-edge px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-hover"
            onClick={() => onSuggestion?.(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}