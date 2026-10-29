import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { guard, json, failure, body, HttpError, now } from "@/lib/server";
import {
  outlookAccount,
  normalizeMessage,
  type ProviderMessage,
} from "@/lib/outlook";
import { safeProviderId } from "@/lib/outlook-policy";
import { composeMime } from "@/lib/outlook-mime";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { user, db } = await guard(),
      q = new URL(request.url).searchParams;
    const id = q.get("accountId") ?? "",
      { api } = await outlookAccount(id, user.userId);
    if (q.get("threadId")) {
      const thread = await api(
        "gmail",
        `threads/${safeProviderId(q.get("threadId")!)}?format=full`,
      );
      return json({ messages: (thread.messages ?? []).map(normalizeMessage) });
    }
    if (q.get("draftId")) {
      const draft = await api(
        "gmail",
        `drafts/${safeProviderId(q.get("draftId")!)}?format=full`,
      );
      return json({
        draftId: draft.id,
        message: normalizeMessage(draft.message),
      });
    }
    const params = new URLSearchParams({
      maxResults: "30",
      includeSpamTrash: "true",
    });
    const search = q.get("q") ?? "";
    if (search.length > 1500) throw new HttpError(400, "Search is too long.");
    if (search) params.set("q", search);
    const folder = q.get("folder") ?? "INBOX",
      page = q.get("pageToken");
    if (page) {
      if (page.length > 1000) throw new HttpError(400, "Invalid page.");
      params.set("pageToken", page);
    }
    const drafts = folder === "DRAFT";
    if (folder === "ARCHIVE")
      params.set(
        "q",
        `-in:inbox -in:sent -in:drafts -in:trash -in:spam ${search}`,
      );
    else if (folder !== "ALL" && !drafts) params.set("labelIds", folder);
    const list = await api(
        "gmail",
        `${drafts ? "drafts" : "messages"}?${params}`,
      ),
      entries = (drafts ? list.drafts : list.messages) ?? [];
    const messages: unknown[] = new Array(entries.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (next < entries.length) {
          const i = next++,
            item = entries[i],
            message = await api(
              "gmail",
              `messages/${safeProviderId(drafts ? item.message.id : item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
            );
          messages[i] = {
            ...normalizeMessage(message as ProviderMessage),
            ...(drafts ? { draftId: item.id } : {}),
          };
        }
      }),
    );
    const syncedAt = now();
    await db
      .update(accounts)
      .set({ syncedAt })
      .where(and(eq(accounts.id, id), eq(accounts.ownerId, user.userId)));
    return json({
      messages,
      nextPageToken: list.nextPageToken ?? null,
      syncedAt,
    });
  } catch (e) {
    return failure(e);
  }
}
const outgoing = z.object({
  accountId: z.string().max(100),
  action: z.enum(["send", "draft"]),
  draftId: z.string().max(256).optional(),
  to: z.string().max(5000),
  cc: z.string().max(5000).optional(),
  bcc: z.string().max(5000).optional(),
  subject: z.string().max(500),
  html: z.string().max(300_000),
  threadId: z.string().max(256).optional(),
  inReplyTo: z.string().max(1000).optional(),
  references: z.string().max(5000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(255),
        type: z.string().max(150),
        data: z.string().max(900_000),
      }),
    )
    .max(10)
    .optional(),
});
export async function POST(request: Request) {
  try {
    const { user } = await guard(request),
      parsed = outgoing.safeParse(await body(request));
    if (!parsed.success)
      throw new HttpError(400, "Check recipients, message, and attachments.");
    const p = parsed.data,
      { row, api } = await outlookAccount(p.accountId, user.userId, "mail");
    let raw: string;
    try {
      raw = composeMime(row.email, p, p.action === "draft");
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const message = {
      raw,
      ...(p.threadId ? { threadId: safeProviderId(p.threadId) } : {}),
    };
    if (p.action === "draft")
      return json(
        await api(
          "gmail",
          p.draftId ? `drafts/${safeProviderId(p.draftId)}` : "drafts",
          {
            method: p.draftId ? "PUT" : "POST",
            body: JSON.stringify({ message }),
          },
        ),
      );
    // Sending a saved draft consumes that draft, avoiding duplicate lingering copies.
    if (p.draftId) {
      await api("gmail", `drafts/${safeProviderId(p.draftId)}`, {
        method: "PUT",
        body: JSON.stringify({ message }),
      });
      return json(
        await api("gmail", "drafts/send", {
          method: "POST",
          body: JSON.stringify({ id: p.draftId }),
        }),
      );
    }
    return json(
      await api("gmail", "messages/send", {
        method: "POST",
        body: JSON.stringify(message),
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const { user } = await guard(request),
      p = z
        .object({
          accountId: z.string(),
          id: z.string(),
          add: z.array(z.string().max(256)).max(20).default([]),
          remove: z.array(z.string().max(256)).max(20).default([]),
        })
        .safeParse(await body(request));
    if (!p.success) throw new HttpError(400, "Choose a message and labels.");
    const { api } = await outlookAccount(p.data.accountId, user.userId, "mail");
    if (p.data.add.includes("TRASH"))
      return json(
        await api("gmail", `messages/${safeProviderId(p.data.id)}/trash`, {
          method: "POST",
        }),
      );
    return json(
      await api("gmail", `messages/${safeProviderId(p.data.id)}/modify`, {
        method: "POST",
        body: JSON.stringify({
          addLabelIds: p.data.add,
          removeLabelIds: p.data.remove,
        }),
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
