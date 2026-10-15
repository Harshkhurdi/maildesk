"use client";

import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
} from "react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { Attachment } from "@/lib/ai-studio/storage/db";

export interface ComposerHandle {
  setValue: (value: string) => void;
  focus: () => void;
}

const MAX_FILES = 4;
const MAX_BYTES = 500 * 1024; // 5 MB per file

async function toAttachment(file: File): Promise<Attachment | null> {
  if (file.size > MAX_BYTES) return null;
  const isImage = ["image/png","image/jpeg","image/webp","image/gif"].includes(file.type);
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) return null;
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return {
    kind: isImage ? "image" : "pdf",
    url: `data:${file.type};base64,${btoa(binary)}`,
    name: file.name || (isImage ? "image" : "document.pdf"),
  };
}

interface ComposerProps {
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  visionReady: boolean; // selected model accepts images
  onSubmit: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
}

/**
 * Chat composer: auto-growing textarea, image + PDF attachments via
 * picker / paste / drag-drop. Enter sends · Shift+Enter newline.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { disabled = false, busy = false, hint, visionReady, onSubmit, onStop },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  // Expose imperative handle so the page can prefill (edit / suggestions).
  useImperativeHandle(ref, () => ({
    setValue(value: string) {
      const el = innerRef.current;
      if (el) {
        el.value = value;
        autoresize();
        el.focus();
      }
    },
    focus() {
      innerRef.current?.focus();
    },
  }));

  function autoresize() {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    const room = Math.max(MAX_FILES - attachments.length, 0);
    const list = Array.from(files);
    const accepted: Attachment[] = [];
    for (const file of list.slice(0, room)) {
      const att = await toAttachment(file);
      if (att) accepted.push(att);
    }
    if (list.length > room || accepted.length < Math.min(list.length, room)) {
      setAttachError("Some files skipped — images/PDF only, max 500 KB each, 4 per message; conversation requests are limited to 1 MB.");
    }
    setAttachments((prev) => [...prev, ...accepted]);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) void addFiles(e.target.files);
    e.target.value = "";
  }

  function submit() {
    const text = innerRef.current?.value.trim() ?? "";
    if ((!text && attachments.length === 0) || disabled || busy) return;
    if(attachments.some(a=>a.kind==="image")&&!visionReady){setAttachError("Choose a vision model before sending images.");return;}
    if (innerRef.current) innerRef.current.value = "";
    autoresize();
    const atts = attachments;
    setAttachments([]);
    setAttachError(null);
    onSubmit(text, atts);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const hasImages = attachments.some((a) => a.kind === "image");

  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 pb-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div key={i} className="group/att relative">
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} className="h-16 w-16 rounded-lg border border-edge object-cover" />
              ) : (
                <div className="flex h-16 items-center gap-2 rounded-lg border border-edge bg-composer px-3 text-xs text-ink">
                  📄 <span className="max-w-[120px] truncate">{a.name}</span>
                </div>
              )}
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove ${a.name}`}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-ink text-app group-hover/att:flex"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-3xl border bg-composer p-2 pl-2 shadow-sm transition-colors focus-within:border-accent ${
          dragOver ? "border-accent" : "border-edge"
        }`}
      >
        <button
          aria-label="Attach image or PDF"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || busy || attachments.length >= MAX_FILES}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-hover hover:text-ink disabled:opacity-30"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          multiple
          hidden
          onChange={onPick}
        />
        <textarea
          ref={innerRef}
          aria-label="AI message"
          maxLength={100000}
          rows={1}
          onChange={autoresize}
          onKeyDown={onKeyDown}
          placeholder={
            disabled
              ? "Select a free model to start…"
              : "Message AI Studio…"
          }
          disabled={disabled}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-secondary"
        />
        {busy ? (
          <button
            aria-label="Stop generating"
            onClick={onStop}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            aria-label="Send message"
            onClick={submit}
            disabled={disabled}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5m-7 7 7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
      {(attachError || (hasImages && !visionReady)) && (
        <p className="mt-2 text-center text-xs text-red-500">
          {hasImages && !visionReady
            ? "⚠ The selected model can't see images — pick a model with the vision badge."
            : attachError}
        </p>
      )}
      {hint && <p className="mt-2 text-center text-xs text-ink-secondary">{hint}</p>}
    </div>
  );
});