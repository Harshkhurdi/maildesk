import { z } from "zod";
import { guard, body, json, failure, HttpError } from "@/lib/server";
import { outlookAccount } from "@/lib/outlook";
import { safeProviderId } from "@/lib/outlook-policy";
import {
  calendarEventInput,
  providerCalendarEvent,
} from "@/lib/calendar-policy";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { user } = await guard(),
      q = new URL(request.url).searchParams,
      { api } = await outlookAccount(
        q.get("accountId") ?? "",
        user.userId,
        "calendar",
      );
    const start = q.get("start"),
      end = q.get("end");
    if (
      !start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) ||
      Date.parse(end) - Date.parse(start) > 93 * 86400000
    )
      throw new HttpError(400, "Choose a calendar range of at most 93 days.");
    const params = new URLSearchParams({
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (q.get("pageToken"))
      params.set("pageToken", q.get("pageToken")!.slice(0, 1000));
    return json(await api("calendar", `events?${params}`));
  } catch (e) {
    return failure(e);
  }
}
async function write(request: Request, update: boolean) {
  try {
    const { user } = await guard(request),
      p = z
        .object({
          accountId: z.string(),
          id: z.string().optional(),
          etag: z.string().max(300).optional(),
          event: calendarEventInput,
        })
        .safeParse(await body(request));
    if (!p.success || (update && (!p.data.id || !p.data.etag)))
      throw new HttpError(
        400,
        "Check the event title, times, timezone and guests. Reopen an event before editing it.",
      );
    const { api } = await outlookAccount(
      p.data.accountId,
      user.userId,
      "calendar",
    );
    return json(
      await api(
        "calendar",
        `events${update ? "/" + safeProviderId(p.data.id!) : ""}?sendUpdates=all`,
        {
          method: update ? "PATCH" : "POST",
          headers: update ? { "If-Match": p.data.etag! } : {},
          body: JSON.stringify(providerCalendarEvent(p.data.event)),
        },
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export function POST(request: Request) {
  return write(request, false);
}
export function PATCH(request: Request) {
  return write(request, true);
}
export async function DELETE(request: Request) {
  try {
    const { user } = await guard(request),
      p = z
        .object({
          accountId: z.string(),
          id: z.string(),
          etag: z.string().max(300),
        })
        .safeParse(await body(request));
    if (!p.success) throw new HttpError(400, "Choose an event.");
    const { api } = await outlookAccount(
      p.data.accountId,
      user.userId,
      "calendar",
    );
    await api(
      "calendar",
      `events/${safeProviderId(p.data.id)}?sendUpdates=all`,
      { method: "DELETE", headers: { "If-Match": p.data.etag } },
    );
    return json({ deleted: true });
  } catch (e) {
    return failure(e);
  }
}
