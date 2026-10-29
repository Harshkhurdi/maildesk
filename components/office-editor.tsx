"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Download, Save, History, Sparkles, X } from "lucide-react";
import { suiteApi, type NativeFile } from "./suite-api";
import { download } from "@/lib/exporters";
const AIStudioPanel = dynamic(() => import("./ai-studio/workspace"), {
  ssr: false,
});
type EditorReply = {
  id?: string;
  type: string;
  payload?: { file?: File; dirty?: boolean; message?: string };
};
export function OfficeEditor({
  file,
  onClose,
}: {
  file: NativeFile;
  onClose: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null),
    pending = useRef(
      new Map<
        string,
        {
          resolve: (p: NonNullable<EditorReply["payload"]>) => void;
          reject: (e: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >(),
    );
  const dirty = useRef(false),
    recovery = useRef<File | null>(null),
    revision = useRef(file.revision),
    sequence = useRef(0),
    busy = useRef(false),
    alive = useRef(true),
    opened = useRef(false),
    autosave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading browser editor…"),
    [saving, setSaving] = useState(false),
    [showAI, setShowAI] = useState(false),
    [hasRecovery, setHasRecovery] = useState(false),
    [versions, setVersions] = useState<
      { revision: number; createdAt: string }[] | null
    >(null);
  const saveRef = useRef<(close?: boolean) => Promise<void>>(async () => {});
  function schedule() {
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => {
      autosave.current = null;
      if (dirty.current && !busy.current) void saveRef.current();
    }, 30_000);
  }
  function command(type: string, payload: Record<string, unknown> = {}) {
    return new Promise<NonNullable<EditorReply["payload"]>>(
      (resolve, reject) => {
        const id = crypto.randomUUID(),
          timer = setTimeout(() => {
            pending.current.delete(id);
            reject(
              Error(
                "The browser editor did not finish this action. Keep it open and retry.",
              ),
            );
          }, 90_000);
        pending.current.set(id, { resolve, reject, timer });
        iframe.current?.contentWindow?.postMessage(
          { id, type, payload },
          window.location.origin,
        );
      },
    );
  }
  useEffect(() => {
    alive.current = true;
    opened.current = false;
    const controller = new AbortController(),
      requests = pending.current;
    async function receive(event: MessageEvent<EditorReply>) {
      if (
        event.source !== iframe.current?.contentWindow ||
        event.origin !== window.location.origin ||
        !event.data ||
        typeof event.data.type !== "string"
      )
        return;
      const { id, type, payload = {} } = event.data;
      const request = id ? requests.get(id) : undefined;
      if (
        request &&
        (type === "document:opened" ||
          type === "document:saved" ||
          type === "document:error" ||
          type === "document:state")
      ) {
        clearTimeout(request.timer);
        requests.delete(id!);
        if (type === "document:error")
          request.reject(
            Error(
              payload.message || "The editor could not finish this action.",
            ),
          );
        else request.resolve(payload);
      }
      if (type === "document:ready" && !opened.current) {
        opened.current = true;
        try {
          const response = await fetch(
            `/api/office/files/${file.id}/download`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok)
            throw Error(
              "The saved file could not be opened. Sign in again or retry.",
            );
          const buffer = await response.arrayBuffer();
          if (controller.signal.aborted) return;
          setStatus("Opening file on your machine…");
          await command("document:open-buffer", {
            fileName: `${file.title}.${file.extension}`,
            buffer,
            readonly: false,
          });
          if (alive.current) {
            setReady(true);
            setStatus("Saved · editing runs on your machine");
          }
        } catch (e) {
          if (!controller.signal.aborted) setError((e as Error).message);
        }
      }
      if (type === "document:dirty-changed" && payload.dirty) {
        dirty.current = true;
        sequence.current++;
        setStatus("Unsaved changes · autosave pending");
        schedule();
      }
      if (type === "document:error" && !request)
        setError(payload.message || "The editor reported an error.");
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || recovery.current || busy.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("message", receive);
    window.addEventListener("beforeunload", warn);
    return () => {
      alive.current = false;
      controller.abort();
      window.removeEventListener("message", receive);
      window.removeEventListener("beforeunload", warn);
      if (autosave.current) clearTimeout(autosave.current);
      for (const r of requests.values()) {
        clearTimeout(r.timer);
        r.reject(Error("Editor closed."));
      }
      requests.clear();
    };
    // The frame and file identity are fixed for this mounted editor. Messages read live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);
  async function save(close = false) {
    if (busy.current) return;
    if (!ready) {
      if (close && !dirty.current && !recovery.current) onClose();
      return;
    }
    if (!dirty.current && !recovery.current) {
      if (close) onClose();
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    setStatus("Preparing edited file in your browser…");
    const startSequence = sequence.current;
    let newerEdits = false;
    try {
      if (dirty.current || !recovery.current) {
        const result = await command("document:save", {
          targetExt: file.extension.toUpperCase(),
        });
        if (!(result.file instanceof Blob) || result.file.size === 0)
          throw Error("The editor returned no file. Keep it open and retry.");
        recovery.current = new File(
          [result.file],
          `${file.title}.${file.extension}`,
        );
        setHasRecovery(true);
        newerEdits = result.dirty === true;
      }
      const form = new FormData();
      form.set("file", recovery.current!);
      form.set("revision", String(revision.current));
      setStatus("Saving private checkpoint…");
      const result = await suiteApi<{ file: NativeFile }>(
        `/api/office/files/${file.id}`,
        "PATCH",
        form,
      );
      revision.current = result.file.revision;
      recovery.current = null;
      setHasRecovery(false);
      dirty.current = newerEdits || sequence.current !== startSequence;
      setStatus(
        dirty.current ? "Newer edits need saving" : "Saved to your workspace",
      );
      if (dirty.current) schedule();
      else if (close) onClose();
    } catch (e) {
      setError((e as Error).message);
      setStatus("Save failed · keep this editor open");
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  useEffect(() => {
    saveRef.current = save;
  });
  async function exportCopy(extension: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await command("document:save", { targetExt: extension });
      if (!(result.file instanceof Blob))
        throw Error("Export did not return a file.");
      download(result.file, `${file.title}.${extension.toLowerCase()}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section className="native-editor">
      <header className="native-header">
        <button
          className="suite-button"
          disabled={saving}
          onClick={() => void save(true)}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="native-title">
          <strong>{file.title}</strong>
          <small role="status">{status}</small>
        </div>
        <button
          className="suite-button"
          disabled={saving || !ready}
          onClick={() => void save()}
        >
          <Save size={16} />
          {saving ? "Saving…" : "Save checkpoint"}
        </button>
        <button className="suite-button" onClick={() => setShowAI(!showAI)}>
          <Sparkles size={16} />
          Free AI
        </button>
        <a
          className="suite-button"
          href={`/api/office/files/${file.id}/download`}
        >
          <Download size={16} />
          Saved copy
        </a>
        <button
          className="suite-button"
          disabled={!ready || saving}
          onClick={() => void exportCopy("PDF")}
        >
          Export PDF
        </button>
        {file.kind === "sheet" && (
          <button
            className="suite-button"
            disabled={!ready || saving}
            onClick={() => void exportCopy("CSV")}
          >
            Export CSV
          </button>
        )}
        <button
          className="suite-button"
          onClick={() =>
            void suiteApi<{
              versions: { revision: number; createdAt: string }[];
            }>(`/api/office/files/${file.id}/versions`)
              .then((r) => setVersions(r.versions))
              .catch((e) => setError(e.message))
          }
        >
          <History size={16} />
          Versions
        </button>
      </header>
      {error && (
        <div className="suite-error" role="alert">
          {error}
          {hasRecovery && (
            <button
              className="suite-button"
              onClick={() => {
                if (recovery.current)
                  download(recovery.current, recovery.current.name);
              }}
            >
              Download recovery copy
            </button>
          )}
        </div>
      )}
      <div className="native-body">
        <div className="office-host-wrap">
          <iframe
            ref={iframe}
            title={`${file.title} — browser Office editor`}
            src="/office/editor.html?embed=1&locale=en"
            sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
        {showAI && (
          <aside className="office-ai-panel">
            <header>
              <strong>Free AI Studio</strong>
              <a href="/ai-studio" target="_blank" rel="noopener noreferrer">
                Full studio ↗
              </a>
              <button
                aria-label="Close AI panel"
                onClick={() => setShowAI(false)}
              >
                <X size={16} />
              </button>
            </header>
            <p>
              Send a prompt or attach a file yourself. This editor does not send
              the open document to AI.
            </p>
            <AIStudioPanel embedded />
          </aside>
        )}
      </div>
      {versions && (
        <div className="suite-overlay">
          <section
            className="suite-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Version history"
          >
            <h2>Saved versions</h2>
            <p>
              Download a checkpoint to inspect it. Import that copy as a
              separate file to keep this history.
            </p>
            {versions.map((v) => (
              <a
                className="version-row"
                href={`/api/office/files/${file.id}/download?revision=${v.revision}`}
                key={v.revision}
              >
                <span>Version {v.revision}</span>
                <time>{new Date(v.createdAt).toLocaleString()}</time>
                <Download size={16} />
              </a>
            ))}
            <button className="suite-button" onClick={() => setVersions(null)}>
              Close
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
