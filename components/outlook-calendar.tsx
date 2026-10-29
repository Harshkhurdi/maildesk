"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { suiteApi } from "./suite-api";
import type { OutlookAccount } from "./outlook-workspace";
import {
  calendarRange,
  eventOverlapsDay,
  localDateKey,
  localDateTimeInput,
  type CalendarView,
} from "@/lib/calendar-view";
type CalendarEvent = {
  id: string;
  etag: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
  reminders?: {
    useDefault?: boolean;
    overrides?: { minutes: number; method: string }[];
  };
  recurringEventId?: string;
  recurrence?: string[];
  htmlLink?: string;
  status?: string;
};
type EventForm = {
  id?: string;
  etag?: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  attendees: string;
  reminder: string;
};
export function OutlookCalendar({
  account,
  onSettings,
}: {
  account: OutlookAccount;
  onSettings: () => void;
}) {
  const [anchor, setAnchor] = useState(() => new Date()),
    [view, setView] = useState<CalendarView>("month"),
    [events, setEvents] = useState<CalendarEvent[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [form, setForm] = useState<EventForm | null>(null),
    [nextPage, setNextPage] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const range = useMemo(() => calendarRange(anchor, view), [anchor, view]),
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const load = useCallback(
    async (signal?: AbortSignal, page?: string) => {
      if (!account.capabilities.calendar) return;
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({
          accountId: account.id,
          start: range.start.toISOString(),
          end: range.end.toISOString(),
        });
        if (page) q.set("pageToken", page);
        const r = await suiteApi<{
          items: CalendarEvent[];
          nextPageToken?: string;
        }>(`/api/outlook/calendar?${q}`, "GET", undefined, signal);
        if (signal?.aborted) return;
        setEvents((current) =>
          page ? [...current, ...(r.items ?? [])] : (r.items ?? []),
        );
        setNextPage(r.nextPageToken ?? null);
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [account.id, account.capabilities.calendar, range],
  );
  // Reset the visible range and synchronize its external calendar subscription.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents([]);
    setNextPage(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  function step(direction: number) {
    const next = new Date(anchor);
    if (view === "month") {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    } else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setAnchor(next);
  }
  function create(day = anchor) {
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10);
    setForm({
      summary: "",
      description: "",
      location: "",
      start: localDateTimeInput(start),
      end: localDateTimeInput(end),
      attendees: "",
      reminder: "30",
    });
  }
  function edit(event: CalendarEvent) {
    if (event.start.date || event.recurringEventId || event.recurrence) {
      setNotice(
        "All-day and recurring events can be viewed here. Edit their series and dates in Google Calendar.",
      );
      return;
    }
    setForm({
      id: event.id,
      etag: event.etag,
      summary: event.summary ?? "",
      description: event.description ?? "",
      location: event.location ?? "",
      start: localDateTimeInput(event.start.dateTime!),
      end: localDateTimeInput(event.end.dateTime!),
      attendees: event.attendees?.map((a) => a.email).join(", ") ?? "",
      reminder: String(
        event.reminders?.overrides?.find((r) => r.method === "popup")
          ?.minutes ?? 30,
      ),
    });
  }
  async function save() {
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const start = new Date(form.start),
        end = new Date(form.end);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end <= start
      )
        throw Error("Choose an end after the start.");
      // A nonexistent local time (the spring DST gap) must never silently move an event.
      if (
        localDateTimeInput(start) !== form.start ||
        localDateTimeInput(end) !== form.end
      )
        throw Error(
          "This local time does not exist because of daylight saving. Choose another time.",
        );
      await suiteApi("/api/outlook/calendar", form.id ? "PATCH" : "POST", {
        accountId: account.id,
        id: form.id,
        etag: form.etag,
        event: {
          summary: form.summary,
          description: form.description,
          location: form.location,
          start: start.toISOString(),
          end: end.toISOString(),
          timeZone: zone,
          attendees: form.attendees
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          reminderMinutes:
            form.reminder === "none" ? null : Number(form.reminder),
        },
      });
      setForm(null);
      setNotice("Event saved. Google sends updates to its guests.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!account.capabilities.calendar)
    return (
      <div className="suite-empty">
        <h2>Bring your calendar into view.</h2>
        <p>
          Reconnect this Google account with Calendar permission to view and
          manage events.
        </p>
        <button className="suite-button primary" onClick={onSettings}>
          Enable Calendar
        </button>
      </div>
    );
  return (
    <section className="outlook-calendar">
      <header className="calendar-toolbar">
        <button className="suite-button primary" onClick={() => create()}>
          <Plus size={16} />
          New event
        </button>
        <div>
          <button
            aria-label="Previous calendar period"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="suite-button"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </button>
          <button aria-label="Next calendar period" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <h2>
          {anchor.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
            ...(view === "day" ? { day: "numeric" } : {}),
          })}
        </h2>
        <select
          aria-label="Calendar view"
          value={view}
          onChange={(e) => setView(e.target.value as CalendarView)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <button
          aria-label="Refresh calendar"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </button>
      </header>
      <p className="calendar-zone">
        Times shown in {zone}. For repeated daylight-saving times, the browser
        chooses the earlier offset.
      </p>
      {error && (
        <p className="suite-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="suite-notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p role="status">Loading calendar…</p>}
      <div className={`calendar-grid ${view}`}>
        {range.days.map((day) => (
          <section
            key={localDateKey(day)}
            className={`calendar-day ${day.getMonth() !== anchor.getMonth() ? "other-month" : ""} ${localDateKey(day) === localDateKey(new Date()) ? "today" : ""}`}
          >
            <button
              aria-label={`Create event on ${day.toLocaleDateString()}`}
              className="calendar-date"
              onClick={() => create(day)}
            >
              {day.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
              })}
            </button>
            {events
              .filter(
                (event) =>
                  event.status !== "cancelled" && eventOverlapsDay(event, day),
              )
              .map((event) => (
                <button
                  className="calendar-event"
                  key={event.id}
                  onClick={() => edit(event)}
                >
                  <time>
                    {event.start.date
                      ? "All day"
                      : new Date(event.start.dateTime!).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                  </time>
                  <strong>{event.summary || "Untitled event"}</strong>
                  {view !== "month" && event.location && (
                    <small>{event.location}</small>
                  )}
                </button>
              ))}
          </section>
        ))}
      </div>
      {nextPage && (
        <button
          className="suite-button"
          disabled={loading}
          onClick={() => void load(undefined, nextPage)}
        >
          Load more events
        </button>
      )}
      {form && (
        <div className="suite-overlay">
          <form
            role="dialog"
            aria-modal="true"
            aria-label="Calendar event"
            className="suite-dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <header>
              <h2>{form.id ? "Edit event" : "New event"}</h2>
              <button
                type="button"
                aria-label="Close event"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                <X size={20} />
              </button>
            </header>
            <fieldset disabled={busy}>
              <label>
                Title
                <input
                  required
                  value={form.summary}
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                />
              </label>
              <div className="suite-form-row">
                <label>
                  Start
                  <input
                    type="datetime-local"
                    required
                    value={form.start}
                    onChange={(e) =>
                      setForm({ ...form, start: e.target.value })
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    type="datetime-local"
                    required
                    value={form.end}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                  />
                </label>
              </div>
              <p className="form-help">Timezone: {zone}</p>
              <label>
                Location
                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                />
              </label>
              <label>
                Guests
                <input
                  value={form.attendees}
                  placeholder="name@example.com, another@example.com"
                  onChange={(e) =>
                    setForm({ ...form, attendees: e.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </label>
              <label>
                Reminder
                <select
                  value={form.reminder}
                  onChange={(e) =>
                    setForm({ ...form, reminder: e.target.value })
                  }
                >
                  <option value="none">None</option>
                  {[0, 5, 10, 15, 30, 60, 1440].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "At start" : `${n} minutes before`}
                    </option>
                  ))}
                  {!["none", "0", "5", "10", "15", "30", "60", "1440"].includes(
                    form.reminder,
                  ) && (
                    <option value={form.reminder}>
                      {form.reminder} minutes before
                    </option>
                  )}
                </select>
              </label>
              <p className="form-help">
                Saving or deleting sends Google Calendar updates to guests.
              </p>
              <footer>
                <button className="suite-button primary" type="submit">
                  {busy ? "Saving…" : "Save event"}
                </button>
                {form.id && (
                  <button
                    type="button"
                    className="suite-button danger"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Delete this calendar event and notify its guests?",
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await suiteApi("/api/outlook/calendar", "DELETE", {
                          accountId: account.id,
                          id: form.id,
                          etag: form.etag,
                        });
                        setForm(null);
                        setNotice("Event deleted.");
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                    Delete event
                  </button>
                )}
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
    </section>
  );
}
