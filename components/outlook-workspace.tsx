"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import dynamic from "next/dynamic";
import type { PdfSource } from "./pdf-viewer";
const PdfPreview = dynamic(() => import("./pdf-viewer"), { ssr: false });
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bold,
  CalendarDays,
  Download,
  Forward,
  Inbox,
  Italic,
  Mail,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Search,
  Send,
  Star,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import { suiteApi } from "./suite-api";
import { OutlookCalendar } from "./outlook-calendar";
export type OutlookAccount = {
  id: string;
  email: string;
  syncedAt: string | null;
  capabilities: { read: boolean; mail: boolean; calendar: boolean };
};
type Attachment = { name: string; size: number; type: string; id: string };
export type EmailMessage = {
  id: string;
  threadId: string;
  draftId?: string;
  subject: string;
  from: string;
  replyTo: string;
  to: string;
  cc: string;
  bcc: string;
  date: string;
  text: string;
  html: string;
  snippet: string;
  labels: string[];
  attachments: Attachment[];
  messageId: string;
  references: string;
  inReplyTo?: string;
};
type Compose = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  html: string;
  draftId?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments: { name: string; type: string; data: string }[];
};
const folders = [
  ["INBOX", "Inbox"],
  ["SENT", "Sent"],
  ["DRAFT", "Drafts"],
  ["STARRED", "Flagged"],
  ["ARCHIVE", "Archive"],
  ["TRASH", "Trash"],
  ["SPAM", "Spam"],
  ["ALL", "All mail"],
];
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function safeEmailHtml(value: string) {
  const html = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      "p",
      "div",
      "span",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "table",
      "tbody",
      "thead",
      "tr",
      "td",
      "th",
      "a",
      "hr",
      "pre",
      "code",
    ],
    ALLOWED_ATTR: ["href", "colspan", "rowspan"],
  });
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a").forEach((a) => {
    if (!/^(https?:|mailto:)/i.test(a.getAttribute("href") ?? ""))
      a.removeAttribute("href");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  return doc.body.innerHTML;
}
function addresses(value: string) {
  return (
    value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  );
}
async function fileBase64(file: Blob) {
  const data = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  data.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}
export function OutlookWorkspace({ onSettings }: { onSettings: () => void }) {
  const [accounts, setAccounts] = useState<OutlookAccount[]>([]),
    [accountId, setAccountId] = useState(""),
    [folder, setFolder] = useState("INBOX"),
    [labels, setLabels] = useState<
      { id: string; name: string; type: string }[]
    >([]),
    [messages, setMessages] = useState<EmailMessage[]>([]),
    [thread, setThread] = useState<EmailMessage[]>([]),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState<string | null>(null),
    [pages, setPages] = useState<(string | null)[]>([]),
    [nextPage, setNextPage] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [syncedAt, setSyncedAt] = useState<string | null>(null),
    [calendar, setCalendar] = useState(false),
    [compose, setCompose] = useState<Compose | null>(null),
    [signature, setSignature] = useState(""),
    [showSignature, setShowSignature] = useState(false);
  const [pdf, setPdf] = useState<PdfSource | null>(null);
  const [pdfDirty, setPdfDirty] = useState(false);
  const account = accounts.find((a) => a.id === accountId),
    composer = useRef<HTMLDivElement>(null),
    attachmentInput = useRef<HTMLInputElement>(null),
    generation = useRef(0),
    composeGeneration = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    suiteApi<{ accounts: OutlookAccount[] }>(
      "/api/outlook/accounts",
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        setAccounts(r.accounts);
        setAccountId(r.accounts[0]?.id ?? "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  // Restore this account’s browser-only preference after hydration.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSignature(
        localStorage.getItem(`maildesk-signature:${accountId}`) ?? "",
      );
    } catch {
      setSignature("");
    }
  }, [accountId]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!accountId || calendar) return;
      const sequence = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({ accountId, folder, q: query });
        if (page) q.set("pageToken", page);
        const r = await suiteApi<{
          messages: EmailMessage[];
          nextPageToken: string | null;
          syncedAt: string;
        }>(`/api/outlook/messages?${q}`, "GET", undefined, signal);
        if (sequence !== generation.current) return;
        setMessages(r.messages);
        setNextPage(r.nextPageToken);
        setSyncedAt(r.syncedAt);
      } catch (e) {
        if (!signal?.aborted && sequence === generation.current)
          setError((e as Error).message);
      } finally {
        if (sequence === generation.current) setLoading(false);
      }
    },
    [accountId, calendar, folder, query, page],
  );
  // The loader synchronizes external provider data and owns its loading/error state.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    suiteApi<{ labels: { id: string; name: string; type: string }[] }>(
      `/api/outlook/labels?accountId=${accountId}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => setLabels(r.labels ?? []))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [accountId]);
  const composerHtml = compose?.html;
  useEffect(() => {
    if (composerHtml !== undefined && composer.current)
      composer.current.innerHTML = safeEmailHtml(composerHtml);
  }, [composerHtml]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (compose) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [compose]);
  function resetPage() {
    setMessages([]);
    setPage(null);
    setPages([]);
    setThread([]);
    generation.current++;
  }
  async function action(
    message: EmailMessage,
    add: string[] = [],
    remove: string[] = [],
  ) {
    if (!account || busy) return;
    setBusy(true);
    setError("");
    try {
      await suiteApi("/api/outlook/messages", "PATCH", {
        accountId,
        id: message.id,
        add,
        remove,
      });
      setThread((current) =>
        current.map((m) =>
          m.id === message.id
            ? {
                ...m,
                labels: [
                  ...new Set([
                    ...m.labels.filter((l) => !remove.includes(l)),
                    ...add,
                  ]),
                ],
              }
            : m,
        ),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function existingAttachments(message: EmailMessage) {
    if (message.attachments.reduce((sum, a) => sum + a.size, 0) > 650_000)
      throw Error(
        "These attachments exceed the 650 KB sending limit. Open this draft or forward it in Gmail to keep all attachments.",
      );
    return Promise.all(
      message.attachments.map(async (a, index) => {
        const response = await fetch(
          `/api/outlook/attachments?${new URLSearchParams({ accountId, messageId: message.id, index: String(index) })}`,
        );
        if (!response.ok)
          throw Error(
            "An existing attachment could not be loaded. This message has not been changed.",
          );
        return {
          name: a.name,
          type: a.type,
          data: await fileBase64(await response.blob()),
        };
      }),
    );
  }
  async function openMessage(message: EmailMessage) {
    const sequence = ++generation.current;
    setBusy(true);
    setError("");
    try {
      if (message.draftId) {
        const r = await suiteApi<{ message: EmailMessage; draftId: string }>(
            `/api/outlook/messages?${new URLSearchParams({ accountId, draftId: message.draftId })}`,
          ),
          attachments = await existingAttachments(r.message);
        if (sequence !== generation.current) return;
        composeGeneration.current++;
        setCompose({
          to: addresses(r.message.to).join(", "),
          cc: addresses(r.message.cc).join(", "),
          bcc: addresses(r.message.bcc).join(", "),
          subject:
            r.message.subject === "(No subject)" ? "" : r.message.subject,
          html:
            r.message.html ||
            `<p>${escape(r.message.text).replace(/\n/g, "<br>")}</p>`,
          draftId: r.draftId,
          threadId: r.message.threadId,
          inReplyTo: r.message.inReplyTo || undefined,
          references: r.message.references || undefined,
          attachments,
        });
      } else {
        const r = await suiteApi<{ messages: EmailMessage[] }>(
          `/api/outlook/messages?${new URLSearchParams({ accountId, threadId: message.threadId })}`,
        );
        if (sequence !== generation.current) return;
        setThread(r.messages);
        if (window.matchMedia("(max-width: 760px)").matches)
          requestAnimationFrame(() =>
            window.scrollTo({
              top: 0,
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            }),
          );
      }
    } catch (e) {
      if (sequence === generation.current) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function newCompose() {
    composeGeneration.current++;
    setCompose({
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      html: `<p><br></p>${signature ? `<p>${escape(signature).replace(/\n/g, "<br>")}</p>` : ""}`,
      attachments: [],
    });
  }
  async function respond(
    message: EmailMessage,
    mode: "reply" | "all" | "forward",
  ) {
    setBusy(true);
    setError("");
    try {
      const own = account?.email.toLowerCase(),
        recipients =
          mode === "forward"
            ? []
            : [
                ...new Set([
                  ...addresses(message.replyTo),
                  ...(mode === "all" ? addresses(message.to) : []),
                ]),
              ].filter((a) => a.toLowerCase() !== own);
      const attachments =
        mode === "forward" ? await existingAttachments(message) : [];
      composeGeneration.current++;
      setCompose({
        to: recipients.join(", "),
        cc:
          mode === "all"
            ? addresses(message.cc)
                .filter(
                  (a) => a.toLowerCase() !== own && !recipients.includes(a),
                )
                .join(", ")
            : "",
        bcc: "",
        subject:
          mode === "forward"
            ? `Fwd: ${message.subject}`
            : /^re:/i.test(message.subject)
              ? message.subject
              : `Re: ${message.subject}`,
        html: `<p><br></p>${signature ? `<p>${escape(signature).replace(/\n/g, "<br>")}</p>` : ""}<blockquote><p>${escape(message.from)} · ${escape(message.date)}</p><p>${escape(message.text).replace(/\n/g, "<br>")}</p></blockquote>`,
        ...(mode !== "forward"
          ? {
              threadId: message.threadId,
              inReplyTo: message.messageId || undefined,
              references: [message.references, message.messageId]
                .filter(Boolean)
                .join(" "),
            }
          : {}),
        attachments,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitCompose(send: boolean) {
    if (!compose || busy) return;
    setBusy(true);
    setError("");
    const sequence = composeGeneration.current;
    try {
      const result = await suiteApi<{ id: string }>(
        "/api/outlook/messages",
        "POST",
        {
          ...compose,
          html: safeEmailHtml(composer.current?.innerHTML ?? compose.html),
          accountId,
          action: send ? "send" : "draft",
        },
      );
      if (sequence !== composeGeneration.current) return;
      if (send) setCompose(null);
      else
        setCompose((current) =>
          current
            ? {
                ...current,
                draftId: result.id,
                html: composer.current?.innerHTML ?? current.html,
              }
            : null,
        );
      setNotice(send ? "Message sent." : "Draft saved in Gmail.");
      await load();
    } catch (e) {
      setError(
        (e as Error).message +
          (send
            ? " Sending may have reached Google; check Sent before retrying."
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!accounts.length)
    return (
      <div className="suite-empty">
        <Mail size={44} />
        <h2>Your inbox belongs here.</h2>
        <p>
          Connect Gmail to read your mail. Enable mail actions and Calendar only
          when you need them.
        </p>
        {error && <p className="suite-error">{error}</p>}
        <button className="suite-button primary" onClick={onSettings}>
          Connect Google account
        </button>
      </div>
    );
  const contacts = [
    ...new Set([
      ...messages.flatMap((m) => [...addresses(m.from), ...addresses(m.to)]),
      ...thread.flatMap((m) => addresses(m.from)),
    ]),
  ];
  return (
    <section className="outlook-workspace">
      <header className="outlook-toolbar">
        <div>
          <button
            className={`suite-button ${!calendar ? "selected" : ""}`}
            disabled={!!compose || busy}
            onClick={() => {
              resetPage();
              setCalendar(false);
            }}
          >
            <Mail size={16} />
            Mail
          </button>
          <button
            className={`suite-button ${calendar ? "selected" : ""}`}
            disabled={!!compose || busy}
            onClick={() => {
              resetPage();
              setCalendar(true);
            }}
          >
            <CalendarDays size={16} />
            Calendar
          </button>
        </div>
        <select
          aria-label="Email account"
          disabled={!!compose || busy}
          value={accountId}
          onChange={(e) => {
            resetPage();
            setAccountId(e.target.value);
            setSyncedAt(null);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
        </select>
        <button className="suite-button" onClick={onSettings}>
          Accounts
        </button>
      </header>
      {error && (
        <div role="alert" className="suite-error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="suite-notice">
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {calendar ? (
        <OutlookCalendar
          key={accountId}
          account={account!}
          onSettings={onSettings}
        />
      ) : (
        <div
          className={`outlook-columns ${thread.length ? "thread-open" : ""}`}
        >
          <aside className="mail-folders">
            <button
              className="suite-button primary"
              disabled={!account?.capabilities.mail || busy || !!compose}
              onClick={newCompose}
            >
              <Plus size={16} />
              New mail
            </button>
            {!account?.capabilities.mail && (
              <button className="permission-note" onClick={onSettings}>
                Enable sending and mail actions
              </button>
            )}
            {folders.map(([id, name]) => (
              <button
                key={id}
                disabled={busy || !!compose}
                className={folder === id ? "active" : ""}
                onClick={() => {
                  resetPage();
                  setFolder(id);
                }}
              >
                <Inbox size={15} />
                {name}
              </button>
            ))}
            {labels
              .filter((l) => l.type === "user")
              .map((label) => (
                <button
                  key={label.id}
                  disabled={busy || !!compose}
                  className={folder === label.id ? "active" : ""}
                  onClick={() => {
                    resetPage();
                    setFolder(label.id);
                  }}
                >
                  {label.name}
                </button>
              ))}
            <button
              disabled={!account?.capabilities.mail || busy}
              onClick={async () => {
                const name = prompt("Folder / label name");
                if (!name?.trim()) return;
                setBusy(true);
                try {
                  const r = await suiteApi<{
                    id: string;
                    name: string;
                    type: string;
                  }>("/api/outlook/labels", "POST", { accountId, name });
                  setLabels((current) => [...current, { ...r, type: "user" }]);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Plus size={14} />
              New folder
            </button>
            <button onClick={() => setShowSignature(true)}>
              Email signature
            </button>
            <small>
              Synced{" "}
              {syncedAt
                ? new Date(syncedAt).toLocaleTimeString()
                : account?.syncedAt
                  ? new Date(account.syncedAt).toLocaleString()
                  : "not yet"}
            </small>
          </aside>
          <section className="message-list">
            <form
              className="mail-search"
              onSubmit={(e) => {
                e.preventDefault();
                resetPage();
                setQuery(search);
              }}
            >
              <Search size={17} />
              <input
                aria-label="Search mail"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="from:, to:, subject:, after:, before: …"
              />
              <button className="suite-button" type="submit">
                Search
              </button>
            </form>
            <div className="message-list-heading">
              <h2>
                {folders.find(([id]) => id === folder)?.[1] ??
                  labels.find((l) => l.id === folder)?.name ??
                  "Mail"}
              </h2>
              <button
                title="Refresh mail"
                aria-label="Refresh mail"
                disabled={loading || busy}
                onClick={() => void load()}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {loading && (
              <p className="mail-loading" role="status">
                Loading messages…
              </p>
            )}
            {!loading && !messages.length && (
              <div className="suite-empty">
                <Inbox size={30} />
                <p>No messages in this view.</p>
              </div>
            )}
            {messages.map((message) => (
              <button
                key={message.id}
                className={`message-row ${message.labels.includes("UNREAD") ? "unread" : ""} ${thread[0]?.threadId === message.threadId ? "active" : ""}`}
                disabled={busy || !!compose || loading}
                onClick={() => void openMessage(message)}
              >
                <span>
                  <strong>{message.from || "Draft"}</strong>
                  <time>
                    {new Date(message.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </span>
                <b>{message.subject}</b>
                <small>{message.snippet}</small>
                {message.labels.includes("STARRED") && (
                  <Star size={13} fill="currentColor" />
                )}
              </button>
            ))}
            <div className="mail-pagination">
              <button
                className="suite-button"
                aria-label="Previous messages"
                disabled={!pages.length || loading || busy}
                onClick={() => {
                  setPage(pages.at(-1) ?? null);
                  setPages((current) => current.slice(0, -1));
                }}
              >
                <ArrowLeft size={15} />
              </button>
              <span>Page {pages.length + 1}</span>
              <button
                className="suite-button"
                aria-label="Next messages"
                disabled={!nextPage || loading || busy}
                onClick={() => {
                  setPages((current) => [...current, page]);
                  setPage(nextPage);
                }}
              >
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
          <section className="reading-pane">
            {!!thread.length && (
              <button
                className="mobile-mail-back"
                onClick={() => setThread([])}
              >
                <ArrowLeft size={18} />
                Back to inbox
              </button>
            )}
            {!thread.length && (
              <div className="suite-empty">
                <Mail size={38} />
                <h2>A little space to read.</h2>
                <p>Select a message to open the full conversation.</p>
              </div>
            )}
            {thread.map((message) => (
              <article className="email-card" key={message.id}>
                <header>
                  <div>
                    <h2>{message.subject}</h2>
                    <strong>{message.from}</strong>
                    <p>
                      To: {message.to}
                      {message.cc && ` · Cc: ${message.cc}`}
                    </p>
                    <time>{new Date(message.date).toLocaleString()}</time>
                  </div>
                  <button
                    aria-label={
                      message.labels.includes("STARRED")
                        ? "Remove flag"
                        : "Flag message"
                    }
                    disabled={!account?.capabilities.mail || busy}
                    onClick={() =>
                      void action(
                        message,
                        message.labels.includes("STARRED") ? [] : ["STARRED"],
                        message.labels.includes("STARRED") ? ["STARRED"] : [],
                      )
                    }
                  >
                    <Star
                      size={19}
                      fill={
                        message.labels.includes("STARRED") ? "#be8c30" : "none"
                      }
                    />
                  </button>
                </header>
                <div className="mail-actions">
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy || !!compose}
                    onClick={() => void respond(message, "reply")}
                  >
                    <Reply size={14} />
                    Reply
                  </button>
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy || !!compose}
                    onClick={() => void respond(message, "all")}
                  >
                    <ReplyAll size={14} />
                    Reply all
                  </button>
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy || !!compose}
                    onClick={() => void respond(message, "forward")}
                  >
                    <Forward size={14} />
                    Forward
                  </button>
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy}
                    onClick={() => void action(message, [], ["INBOX"])}
                  >
                    <Archive size={14} />
                    Archive
                  </button>
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy}
                    onClick={() => {
                      if (confirm("Move this message to Gmail Trash?"))
                        void action(message, ["TRASH"]);
                    }}
                  >
                    <Trash2 size={14} />
                    Trash
                  </button>
                  <button
                    className="suite-button"
                    disabled={!account?.capabilities.mail || busy}
                    onClick={() =>
                      void action(
                        message,
                        message.labels.includes("UNREAD") ? [] : ["UNREAD"],
                        message.labels.includes("UNREAD") ? ["UNREAD"] : [],
                      )
                    }
                  >
                    {message.labels.includes("UNREAD")
                      ? "Mark read"
                      : "Mark unread"}
                  </button>
                  <select
                    aria-label="Move message to folder"
                    disabled={!account?.capabilities.mail || busy}
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        void action(message, [e.target.value], ["INBOX"]);
                    }}
                  >
                    <option value="">Move to folder…</option>
                    <option value="INBOX">Inbox</option>
                    {labels
                      .filter((l) => l.type === "user")
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                  <select
                    aria-label="Add label to message"
                    disabled={!account?.capabilities.mail || busy}
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        void action(message, [e.target.value]);
                    }}
                  >
                    <option value="">Add label…</option>
                    {labels
                      .filter((l) => l.type === "user")
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div
                  className="email-rendered"
                  dangerouslySetInnerHTML={{
                    __html: safeEmailHtml(
                      message.html ||
                        `<p>${escape(message.text).replace(/\n/g, "<br>")}</p>`,
                    ),
                  }}
                />
                {message.attachments.length > 0 && (
                  <div className="email-attachments">
                    {message.attachments.map((a, index) => (
                      <span key={index}>
                        <button
                          className="suite-button"
                          onClick={async () => {
                            try {
                              const response = await fetch(
                                `/api/outlook/attachments?${new URLSearchParams({ accountId, messageId: message.id, index: String(index) })}`,
                              );
                              if (!response.ok) {
                                const r = await response.json();
                                throw Error(r.error);
                              }
                              const { download } =
                                await import("@/lib/exporters");
                              download(await response.blob(), a.name);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Download size={14} />
                          {a.name} · {Math.ceil(a.size / 1024)} KB
                        </button>
                        {(/\.pdf$/i.test(a.name) ||
                          a.type === "application/pdf") && (
                          <button
                            className="suite-button"
                            onClick={async () => {
                              try {
                                const response = await fetch(
                                  `/api/outlook/attachments?${new URLSearchParams({ accountId, messageId: message.id, index: String(index) })}`,
                                );
                                if (!response.ok) {
                                  const r = await response.json();
                                  throw Error(r.error);
                                }
                                const bytes = await response.arrayBuffer();
                                if (
                                  !new TextDecoder()
                                    .decode(bytes.slice(0, 1024))
                                    .includes("%PDF-")
                                )
                                  throw Error(
                                    "This attachment is not a readable PDF.",
                                  );
                                setPdf({
                                  blob: new Blob([bytes], {
                                    type: "application/pdf",
                                  }),
                                  name: a.name,
                                  origin: "gmail",
                                });
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            Preview PDF
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
      {compose && (
        <div className="suite-overlay">
          <form
            className="suite-dialog compose-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Compose email"
            onSubmit={(e) => {
              e.preventDefault();
              void submitCompose(true);
            }}
          >
            <header>
              <h2>{compose.draftId ? "Edit draft" : "New message"}</h2>
              <button
                type="button"
                aria-label="Close composer"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Close this composer? Only the last draft you saved in Gmail will be kept.",
                    )
                  ) {
                    composeGeneration.current++;
                    setCompose(null);
                  }
                }}
              >
                <X size={20} />
              </button>
            </header>
            <p className="form-help">
              From {account?.email} · Drafts are saved when you choose Save
              draft.
            </p>
            <fieldset disabled={busy}>
              <label>
                To
                <input
                  list="maildesk-contacts"
                  value={compose.to}
                  onChange={(e) =>
                    setCompose({ ...compose, to: e.target.value })
                  }
                  placeholder="name@example.com, another@example.com"
                />
              </label>
              <div className="suite-form-row">
                <label>
                  Cc
                  <input
                    list="maildesk-contacts"
                    value={compose.cc}
                    onChange={(e) =>
                      setCompose({ ...compose, cc: e.target.value })
                    }
                  />
                </label>
                <label>
                  Bcc
                  <input
                    list="maildesk-contacts"
                    value={compose.bcc}
                    onChange={(e) =>
                      setCompose({ ...compose, bcc: e.target.value })
                    }
                  />
                </label>
              </div>
              <datalist id="maildesk-contacts">
                {contacts.map((email) => (
                  <option key={email} value={email} />
                ))}
              </datalist>
              <label>
                Subject
                <input
                  value={compose.subject}
                  onChange={(e) =>
                    setCompose({ ...compose, subject: e.target.value })
                  }
                />
              </label>
              <div className="compose-format">
                {[
                  [Bold, "bold"],
                  [Italic, "italic"],
                  [Underline, "underline"],
                ].map(([Icon, command]) => {
                  const Symbol = Icon as typeof Bold;
                  return (
                    <button
                      type="button"
                      key={command as string}
                      aria-label={command as string}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        composer.current?.focus();
                        document.execCommand(command as string);
                      }}
                    >
                      <Symbol size={16} />
                    </button>
                  );
                })}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    composer.current?.focus();
                    document.execCommand("insertUnorderedList");
                  }}
                >
                  Bullets
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const url = prompt("Link URL (https://…)");
                    if (url && /^https?:\/\//i.test(url)) {
                      composer.current?.focus();
                      document.execCommand("createLink", false, url);
                    }
                  }}
                >
                  Link
                </button>
              </div>
              <div
                ref={composer}
                role="textbox"
                aria-label="Message body"
                aria-multiline="true"
                className="compose-body"
                contentEditable={!busy}
                suppressContentEditableWarning
                onPaste={(e) => {
                  e.preventDefault();
                  document.execCommand(
                    "insertText",
                    false,
                    e.clipboardData.getData("text/plain"),
                  );
                }}
              />
              <input
                hidden
                ref={attachmentInput}
                type="file"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!files.length) return;
                  if (
                    files.reduce((n, f) => n + f.size, 0) +
                      compose.attachments.reduce(
                        (n, f) => n + Math.ceil(f.data.length * 0.75),
                        0,
                      ) >
                      650_000 ||
                    files.length + compose.attachments.length > 10
                  ) {
                    setError(
                      "Attach at most ten files, with a combined message size below 650 KB.",
                    );
                    return;
                  }
                  try {
                    const added = await Promise.all(
                      files.map(async (f) => ({
                        name: f.name,
                        type: f.type || "application/octet-stream",
                        data: await fileBase64(f),
                      })),
                    );
                    setCompose((current) =>
                      current
                        ? {
                            ...current,
                            attachments: [...current.attachments, ...added],
                          }
                        : null,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              {compose.attachments.map((a, i) => (
                <button
                  className="suite-button"
                  type="button"
                  key={i}
                  onClick={() =>
                    setCompose({
                      ...compose,
                      attachments: compose.attachments.filter(
                        (_, index) => index !== i,
                      ),
                    })
                  }
                >
                  {a.name}
                  <X size={13} />
                </button>
              ))}
              <footer>
                <button className="suite-button primary" type="submit">
                  <Send size={15} />
                  {busy ? "Working…" : "Send"}
                </button>
                <button
                  className="suite-button"
                  type="button"
                  onClick={() => void submitCompose(false)}
                >
                  Save draft
                </button>
                <button
                  className="suite-button"
                  type="button"
                  onClick={() => attachmentInput.current?.click()}
                >
                  <Paperclip size={16} />
                  Attach
                </button>
              </footer>
            </fieldset>
            {error && (
              <p className="suite-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
      {pdf && (
        <div className="suite-overlay">
          <section
            className="suite-dialog pdf-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="PDF attachment"
          >
            <header>
              <h2>{pdf.name}</h2>
              <button
                aria-label="Close PDF preview"
                onClick={() => {
                  if (
                    !pdfDirty ||
                    window.confirm(
                      "Discard unsaved PDF changes? Use Save copy first to keep them.",
                    )
                  ) {
                    setPdf(null);
                    setPdfDirty(false);
                  }
                }}
              >
                <X size={20} />
              </button>
            </header>
            <PdfPreview
              source={pdf}
              onSource={setPdf}
              onDirtyChange={setPdfDirty}
            />
          </section>
        </div>
      )}
      {showSignature && (
        <div className="suite-overlay">
          <section
            className="suite-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Email signature"
          >
            <h2>Your signature</h2>
            <p>
              Saved in this browser for {account?.email}. Added to new messages
              and replies.
            </p>
            <textarea
              aria-label="Signature text"
              rows={6}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
            <button
              className="suite-button primary"
              onClick={() => {
                try {
                  localStorage.setItem(
                    `maildesk-signature:${accountId}`,
                    signature,
                  );
                  setShowSignature(false);
                } catch {
                  setError("This browser could not save your signature.");
                }
              }}
            >
              Save signature
            </button>
            <button
              className="suite-button"
              onClick={() => setShowSignature(false)}
            >
              Cancel
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
