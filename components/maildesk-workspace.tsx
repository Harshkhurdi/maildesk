"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AppIcon, TemplatePreview } from "./office-brand";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  FolderOpen,
  LayoutGrid,
  List,
  Grid2X2,
  Cloud,
  ChevronRight,
  Clock3,
  FilePlus2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Pencil,
  Upload,
  X,
} from "lucide-react";
import { SuiteNav } from "./suite-nav";
import { OfficeEditor } from "./office-editor";
import { OutlookWorkspace } from "./outlook-workspace";
import { suiteApi, apps, type NativeFile } from "./suite-api";
import { OFFICE_TEMPLATES } from "@/lib/office-templates";
import { prepareOfficeFile } from "@/lib/office-worker-client";
import type { FileContent, FileKind } from "@/lib/types";
import { download } from "@/lib/exporters";
type WorkspaceData = {
  accounts: {
    id: string;
    email: string;
    syncedAt: string | null;
    error: string | null;
  }[];
  legacyFiles: {
    id: string;
    kind: "document" | "sheet" | "slides";
    title: string;
    updatedAt: string;
  }[];
  configured: boolean;
  callbackUrl: string;
  userName: string;
};
export default function Maildesk() {
  const [active, setActive] = useState("document"),
    [workspace, setWorkspace] = useState<WorkspaceData | null>(null),
    [files, setFiles] = useState<NativeFile[]>([]),
    [configured, setConfigured] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [settings, setSettings] = useState(false),
    [open, setOpen] = useState<NativeFile | null>(null),
    [create, setCreate] = useState(false),
    [title, setTitle] = useState(""),
    [permissions, setPermissions] = useState({ mail: false, calendar: false }),
    [showLegacy, setShowLegacy] = useState(false);
  const [template, setTemplate] = useState("blank"),
    [view, setView] = useState<"list" | "grid">("list");
  const upload = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      suiteApi<WorkspaceData>("/api/workspace"),
      suiteApi<{ files: NativeFile[]; configured: boolean }>(
        "/api/office/files",
      ),
    ]);
    if (results[0].status === "fulfilled") setWorkspace(results[0].value);
    else setError(results[0].reason.message);
    if (results[1].status === "fulfilled") {
      setFiles(results[1].value.files);
      setConfigured(results[1].value.configured);
    } else setError(results[1].reason.message);
    setLoading(false);
  }, []);
  // Initialize browser location and load the external workspace after hydration.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search),
      selected = p.get("app");
    if (apps.some((a) => a.id === selected && a.id !== "ai"))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(selected!);
    if (p.get("settings") === "1") setSettings(true);
    if (p.get("connection_error")) setError(p.get("connection_error")!);
    void reload().then(() => {
      if (p.get("connection_error")) setError(p.get("connection_error")!);
    });
  }, [reload]);
  function select(id: string) {
    if (open) return;
    setActive(id);
    setShowLegacy(false);
    window.history.replaceState(null, "", `/?app=${id}`);
  }
  async function newFile(
    sourceFileId?: string,
    legacyKind?: "document" | "sheet" | "slides",
    legacyTitle?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const name = legacyTitle ?? title.trim(),
        kind = (legacyKind ?? active) as FileKind;
      const source = sourceFileId
        ? await suiteApi<{ file: { content: string } }>(
            `/api/files?id=${encodeURIComponent(sourceFileId)}`,
          )
        : null;
      const native = await prepareOfficeFile({
        type: "create",
        kind,
        title: name,
        template,
        content: source
          ? (JSON.parse(source.file.content) as FileContent)
          : undefined,
      });
      const form = new FormData();
      form.set("file", native);
      form.set("title", name);
      if (sourceFileId) form.set("sourceFileId", sourceFileId);
      const r = await suiteApi<{ file: NativeFile }>(
        "/api/office/files",
        "POST",
        form,
      );
      setCreate(false);
      setOpen(r.file);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 3_000_000)
        throw Error("Choose an Office file smaller than 3 MB.");
      const form = new FormData();
      form.set(
        "file",
        await prepareOfficeFile({
          type: "import",
          name: file.name,
          buffer: await file.arrayBuffer(),
        }),
      );
      const result = await suiteApi<{ file: NativeFile }>(
        "/api/office/files",
        "POST",
        form,
      );
      setOpen(result.file);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function connect(id?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await suiteApi<{ url: string }>(
        "/api/gmail/connect",
        "POST",
        {
          ...(id ? { accountId: id } : {}),
          permissions: Object.entries(permissions)
            .filter(([, enabled]) => enabled)
            .map(([name]) => name),
        },
      );
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const app = apps.find((a) => a.id === active) ?? apps[0],
    visible = files.filter(
      (f) =>
        f.kind === active &&
        f.title.toLowerCase().includes(query.toLowerCase()),
    );
  const kind = active as FileKind,
    fileNoun =
      active === "document"
        ? "document"
        : active === "sheet"
          ? "workbook"
          : "presentation";
  function beginCreate(id = "blank") {
    setTemplate(id);
    const chosen = OFFICE_TEMPLATES[kind]?.find((t) => t.id === id);
    setTitle(
      id === "blank" ? `Untitled ${fileNoun}` : (chosen?.name ?? "Untitled"),
    );
    setCreate(true);
  }
  if (open)
    return (
      <OfficeEditor
        key={open.id}
        file={open}
        onClose={() => {
          setOpen(null);
          void reload();
        }}
      />
    );
  return (
    <div
      className="suite-shell office-shell"
      style={{ "--app-accent": app.color } as CSSProperties}
    >
      <header className="office-topbar">
        <Link href="/" className="office-brand" aria-label="MailDesk home">
          <LayoutGrid size={22} />
          <strong>MailDesk</strong>
          <span className="office-brand-divider" />
          <span>{app.name}</span>
        </Link>
        {active !== "outlook" && (
          <label className="office-global-search">
            <Search size={17} />
            <input
              aria-label="Find files"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search your ${fileNoun}s`}
            />
            <kbd>Search</kbd>
          </label>
        )}
        <div className="office-top-actions">
          <button
            aria-label="Settings and accounts"
            title="Settings and accounts"
            onClick={() => setSettings(true)}
          >
            <Settings size={19} />
          </button>
          <button
            className="suite-avatar"
            aria-label="Open account settings"
            onClick={() => setSettings(true)}
          >
            {workspace?.userName?.slice(0, 1).toUpperCase() ?? "M"}
          </button>
        </div>
      </header>
      <aside className="suite-sidebar">
        <SuiteNav active={active} onSelect={select} />
        <div className="suite-sidebar-bottom">
          <button
            aria-label="Settings & accounts"
            title="Settings & accounts"
            onClick={() => setSettings(true)}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          <a href="/auth/sign-out" title="Sign out">
            Sign out
          </a>
        </div>
      </aside>
      <main className="suite-main">
        {error && (
          <div role="alert" className="suite-error">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {active === "outlook" ? (
          <OutlookWorkspace onSettings={() => setSettings(true)} />
        ) : (
          <div className="suite-library">
            <div className="office-breadcrumb">
              <span>My workspace</span>
              <ChevronRight size={13} />
              <span>{app.name}</span>
            </div>
            <div className="suite-page-heading">
              <div>
                <p className="suite-eyebrow">
                  YOUR IDEAS, READY FOR WHAT’S NEXT
                </p>
                <h1>
                  MailDesk {app.name}
                  <span className="heading-punctuation">.</span>
                </h1>
                <p>
                  {active === "document"
                    ? "Create something worth sharing."
                    : active === "sheet"
                      ? "Turn your data into decisions."
                      : "Bring your next big idea to life."}
                </p>
              </div>
              <AppIcon kind={active} size={64} />
            </div>
            <div className="office-section-heading">
              <h2>Start something new</h2>
              <span>Made for your next {fileNoun}</span>
            </div>
            <div className="office-template-gallery">
              {OFFICE_TEMPLATES[kind].map((t) => (
                <button
                  key={t.id}
                  className="office-template-card"
                  disabled={busy}
                  onClick={() => beginCreate(t.id)}
                  aria-label={
                    t.id === "blank"
                      ? `Create a blank ${fileNoun}`
                      : `Create ${t.name}`
                  }
                >
                  <TemplatePreview kind={active} template={t.id} />
                  <span>
                    <AppIcon kind={active} size={22} />
                    <strong>{t.name}</strong>
                  </span>
                </button>
              ))}
              <button
                className="office-upload-tile"
                disabled={busy}
                onClick={() => upload.current?.click()}
              >
                <div>
                  <Upload size={28} />
                  <strong>Open from this device</strong>
                  <span>Pick up where you left off</span>
                </div>
                <small>
                  {active === "document"
                    ? "DOCX"
                    : active === "sheet"
                      ? "XLSX · CSV"
                      : "PPTX"}{" "}
                  files · up to 3 MB
                </small>
              </button>
            </div>
            <input
              hidden
              ref={upload}
              type="file"
              aria-label="Import Office file"
              accept={
                active === "document"
                  ? ".docx"
                  : active === "sheet"
                    ? ".xlsx,.csv"
                    : ".pptx"
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importFile(file);
              }}
            />
            {!configured && !loading && (
              <div className="office-setup-banner">
                <FolderOpen size={21} />
                <div>
                  <strong>Browser editor needs attention.</strong>
                  <p>
                    The browser editor is unavailable. Reload to retry. Your
                    saved files remain available.
                  </p>
                </div>
                <button
                  className="suite-button"
                  onClick={() => setSettings(true)}
                >
                  Setup details
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
            <div className="suite-file-heading">
              <div className="office-file-tabs">
                <span className="active">
                  <Clock3 size={16} />
                  Recent
                </span>
                <span>
                  Your {fileNoun}s <b>{visible.length}</b>
                </span>
              </div>
              <div>
                <button
                  className="suite-button"
                  disabled={busy}
                  onClick={() => beginCreate()}
                >
                  <Plus size={16} />
                  New {fileNoun}
                </button>
                <div
                  className="office-view-switch"
                  role="group"
                  aria-label="File view"
                >
                  <button
                    aria-label="List view"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={18} />
                  </button>
                  <button
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <Grid2X2 size={17} />
                  </button>
                </div>
                <button
                  aria-label="Refresh files"
                  className="suite-button icon-only"
                  disabled={loading}
                  onClick={() => void reload()}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            {loading ? (
              <p role="status">Loading saved work…</p>
            ) : visible.length ? (
              <div className={`suite-file-grid office-files-${view}`}>
                <div className="office-list-head">
                  <span>Name</span>
                  <span>Last modified</span>
                  <span>Version</span>
                  <span>Actions</span>
                </div>
                {visible.map((file) => (
                  <article className="suite-file-card" key={file.id}>
                    <button className="file-open" onClick={() => setOpen(file)}>
                      <div className="file-preview">
                        <TemplatePreview
                          kind={file.kind}
                          template={
                            file.kind === "document"
                              ? "report"
                              : file.kind === "sheet"
                                ? "budget"
                                : "project"
                          }
                        />
                      </div>
                      <AppIcon kind={file.kind} size={34} />
                      <strong>{file.title}</strong>
                      <small>
                        {new Date(file.updatedAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </small>
                      <span className="office-file-version">
                        v{file.revision}
                      </span>
                    </button>
                    <button
                      className="file-rename"
                      aria-label={`Rename ${file.title}`}
                      disabled={busy}
                      onClick={async () => {
                        const name = prompt("File name", file.title);
                        if (!name?.trim() || name === file.title) return;
                        setBusy(true);
                        try {
                          const result = await suiteApi<{ file: NativeFile }>(
                            `/api/office/files/${file.id}`,
                            "PATCH",
                            { title: name },
                          );
                          setFiles((current) =>
                            current.map((f) =>
                              f.id === file.id ? result.file : f,
                            ),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <a
                      href={`/api/office/files/${file.id}/download`}
                      aria-label={`Download ${file.title}`}
                    >
                      <Download size={16} />
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <div className="suite-empty files-empty">
                <div className="office-empty-icon">
                  <FilePlus2 size={34} />
                </div>
                <h3>
                  {query ? "No matching files" : "Your work will appear here"}
                </h3>
                <p>
                  {query
                    ? "Try another file name."
                    : `Create a ${fileNoun} from a template above, or open a file from your device.`}
                </p>
              </div>
            )}
            {workspace?.legacyFiles.some((f) => f.kind === active) && (
              <section className="legacy-section">
                <button
                  className="suite-button"
                  onClick={() => setShowLegacy(!showLegacy)}
                >
                  <FolderOpen size={16} />
                  Earlier MailDesk files (
                  {
                    workspace.legacyFiles.filter((f) => f.kind === active)
                      .length
                  }
                  )
                </button>
                {showLegacy && (
                  <>
                    <p>
                      Make a native Office copy to continue editing. The earlier
                      saved file is kept. Conversion preserves the content
                      supported by the old editor; it cannot recover formatting
                      previously lost during import.
                    </p>
                    {workspace.legacyFiles
                      .filter((f) => f.kind === active)
                      .map((file) => (
                        <div className="legacy-row" key={file.id}>
                          <FileText size={16} />
                          <strong>{file.title}</strong>
                          <button
                            className="suite-button"
                            disabled={busy}
                            onClick={() =>
                              void newFile(file.id, file.kind, file.title)
                            }
                          >
                            Open Office copy
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      ))}
                  </>
                )}
              </section>
            )}
          </div>
        )}
        <footer className="suite-footer">
          <span>
            <Cloud size={14} /> Your private workspace
          </span>
          <span>Word · Excel · PowerPoint · Outlook · Free AI Studio</span>
        </footer>
      </main>
      {create && (
        <div className="suite-overlay">
          <form
            className="suite-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Create file"
            onSubmit={(e) => {
              e.preventDefault();
              void newFile();
            }}
          >
            <header>
              <h2>New {fileNoun}</h2>
              <button
                type="button"
                aria-label="Close new file"
                disabled={busy}
                onClick={() => setCreate(false)}
              >
                <X size={20} />
              </button>
            </header>
            <label>
              File name
              <input
                required
                autoFocus
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Template
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {OFFICE_TEMPLATES[
                  active as "document" | "sheet" | "slides"
                ].map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="suite-button primary"
              disabled={busy || !title.trim()}
              type="submit"
            >
              {busy ? "Creating…" : "Create file"}
            </button>
            {error && <p className="suite-error">{error}</p>}
          </form>
        </div>
      )}
      {settings && (
        <div className="suite-overlay">
          <section
            className="suite-dialog settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace settings"
          >
            <header>
              <div>
                <p className="suite-eyebrow">CONNECTED, ON YOUR TERMS</p>
                <h2>Settings & accounts</h2>
              </div>
              <button
                aria-label="Close settings"
                disabled={busy}
                onClick={() => setSettings(false)}
              >
                <X size={20} />
              </button>
            </header>
            <h3>Google accounts</h3>
            <p>
              Read-only Gmail works with your existing connections. Select
              additional permissions before connecting or reconnecting an
              account.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={permissions.mail}
                onChange={(e) =>
                  setPermissions({ ...permissions, mail: e.target.checked })
                }
              />
              Enable sending, drafts, labels, and mail actions
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={permissions.calendar}
                onChange={(e) =>
                  setPermissions({ ...permissions, calendar: e.target.checked })
                }
              />
              Enable Calendar events and invitations
            </label>
            {workspace?.accounts.map((account) => (
              <div className="settings-account" key={account.id}>
                <div>
                  <strong>{account.email}</strong>
                  <small>
                    Last sync:{" "}
                    {account.syncedAt
                      ? new Date(account.syncedAt).toLocaleString()
                      : "Not yet"}
                  </small>
                </div>
                <div>
                  <button
                    className="suite-button"
                    disabled={busy}
                    onClick={() => void connect(account.id)}
                  >
                    Reconnect
                  </button>
                  <button
                    className="suite-button"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        !confirm(
                          `Disconnect ${account.email} from Google? Your saved work and earlier records will be kept.`,
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await suiteApi("/api/gmail/disconnect", "POST", {
                          accountId: account.id,
                        });
                        await reload();
                        window.location.assign("/?app=outlook&settings=1");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
            <button
              className="suite-button primary"
              disabled={busy || !workspace?.configured}
              onClick={() => void connect()}
            >
              <Plus size={16} />
              Connect Gmail account
            </button>
            {!workspace?.configured && (
              <p className="form-help">
                Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY
                and APP_ORIGIN. Enable Gmail API and Calendar API, and register
                the redirect URL:
              </p>
            )}
            <code className="setup-code">
              {workspace?.callbackUrl || "APP_ORIGIN/api/gmail/callback"}
            </code>
            <h3>Native Office editors</h3>
            <p>
              Editing and conversion run in your browser. Files are saved to
              your private workspace only when changed. The editor loads when
              you open a file.
            </p>
            <p className="form-help">
              Powered by the AGPL v3 browser Office engine.{" "}
              <a
                href="/office/about.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                About & licenses
              </a>{" "}
              ·{" "}
              <a
                href="https://github.com/ranuts/document/tree/e975654679d2cc3ef61d67d93fdce2839327676c"
                target="_blank"
                rel="noopener noreferrer"
              >
                Editor source
              </a>
            </p>
            <a className="suite-button" href="/auth/sign-out">
              Sign out of MailDesk
            </a>
            <h3>Keep a copy of your work</h3>
            <button
              className="suite-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await fetch("/api/workspace/backup");
                  if (!response.ok)
                    throw Error("The backup could not be created.");
                  download(
                    await response.blob(),
                    "maildesk-workspace-backup.json",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Download size={16} />
              Export workspace data
            </button>
            <button
              className="suite-button"
              onClick={() => {
                try {
                  const raw = localStorage.getItem("maildesk.guest.v1");
                  if (!raw)
                    throw Error(
                      "No earlier guest backup was found in this browser.",
                    );
                  download(
                    new Blob([raw], { type: "application/json" }),
                    "maildesk-browser-backup.json",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Earlier browser data
            </button>
            <p className="form-help">
              Retired tasks, rooms and tool records remain in the database.
              Backups contain private content; keep them somewhere safe. Google
              tokens are excluded. AI conversations can be exported from Free AI
              Studio.
            </p>
            {error && (
              <p className="suite-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
