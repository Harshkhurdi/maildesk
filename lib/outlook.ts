import { and, eq } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { getDb } from "@/db";
import { decrypt, HttpError } from "@/lib/server";
import { accessToken, decodePart, htmlToText } from "@/lib/gmail";
import { googleCapabilities } from "@/lib/outlook-policy";
export async function outlookAccount(
  id: string,
  owner: string,
  capability: "read" | "mail" | "calendar" = "read",
) {
  const [row] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, owner)));
  if (!row) throw new HttpError(404, "Email account not found.");
  const secret = await decrypt(row.token),
    capabilities = googleCapabilities(
      secret.scopes ?? ["https://www.googleapis.com/auth/gmail.readonly"],
    );
  if (!capabilities[capability])
    throw new HttpError(
      403,
      `Reconnect this account and approve ${capability === "calendar" ? "Calendar" : "mail editing and sending"} permissions.`,
    );
  const deadline = AbortSignal.timeout(50_000),
    token = await accessToken(row, deadline);
  return {
    row,
    capabilities,
    api: async (
      service: "gmail" | "calendar",
      path: string,
      init: RequestInit = {},
    ) => {
      const base =
        service === "gmail"
          ? "https://gmail.googleapis.com/gmail/v1/users/me/"
          : "https://www.googleapis.com/calendar/v3/calendars/primary/";
      const response = await fetch(base + path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
        signal: AbortSignal.any([deadline, AbortSignal.timeout(25_000)]),
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401)
          throw new HttpError(
            401,
            "Google access expired. Reconnect this account.",
          );
        if (response.status === 403)
          throw new HttpError(
            403,
            "Google denied this operation. Check granted permissions and enable the Gmail and Calendar APIs.",
          );
        if (response.status === 429)
          throw new HttpError(
            429,
            "Google rate limit reached. Wait before retrying.",
          );
        if (response.status === 412)
          throw new HttpError(
            409,
            "This event changed in another app. Refresh it before saving again.",
          );
        if (response.status === 404)
          throw new HttpError(404, "The message or event no longer exists.");
        throw new HttpError(
          502,
          "Google could not complete this operation. Check its status before retrying.",
        );
      }
      return response.status === 204 ? {} : await response.json();
    },
  };
}
export type ProviderPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  headers?: { name: string; value: string }[];
  parts?: ProviderPart[];
};
export type ProviderMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: ProviderPart;
};
export function normalizeMessage(message: ProviderMessage) {
  const header = (name: string) =>
    message.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";
  const plain: string[] = [],
    html: string[] = [],
    attachments: {
      id: string;
      name: string;
      size: number;
      type: string;
      inlineData?: string;
    }[] = [];
  function walk(part: ProviderPart) {
    if (part.filename) {
      if (part.body?.attachmentId || part.body?.data)
        attachments.push({
          id: part.body?.attachmentId ?? "",
          name: part.filename,
          size: part.body?.size ?? 0,
          type: part.mimeType ?? "application/octet-stream",
          ...(part.body?.data ? { inlineData: part.body.data } : {}),
        });
      return;
    }
    if (part.body?.data) {
      if (part.mimeType === "text/plain")
        plain.push(decodePart(part.body.data));
      if (part.mimeType === "text/html") html.push(decodePart(part.body.data));
    }
    part.parts?.forEach(walk);
  }
  if (message.payload) walk(message.payload);
  return {
    id: message.id,
    threadId: message.threadId,
    subject: header("Subject") || "(No subject)",
    from: header("From"),
    replyTo: header("Reply-To") || header("From"),
    to: header("To"),
    cc: header("Cc"),
    bcc: header("Bcc"),
    messageId: header("Message-ID"),
    references: header("References"),
    inReplyTo: header("In-Reply-To"),
    date: new Date(Number(message.internalDate) || 0).toISOString(),
    snippet: htmlToText(message.snippet ?? ""),
    text: (plain.length ? plain : html.map(htmlToText)).join("\n"),
    html: html.join("\n"),
    labels: message.labelIds ?? [],
    attachments,
  };
}
