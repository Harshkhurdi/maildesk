import { z } from "zod";
import { newId, type Conversation } from "./db";

export const MAX_CHAT_IMPORT_BYTES = 10 * 1024 * 1024;
const timestamp = z.number().finite().nonnegative().max(8.64e15);
const attachment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), name: z.string().min(1).max(200), url: z.string().max(1400000).regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/) }),
  z.object({ kind: z.literal("pdf"), name: z.string().min(1).max(200), url: z.string().max(1400000).regex(/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/) }),
]);
const message = z.object({
  role: z.enum(["user", "assistant"]), content: z.string().max(100000),
  reasoning: z.string().max(100000).optional(), model: z.string().max(200).optional(),
  attachments: z.array(attachment).max(8).optional(),
  tokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  createdAt: timestamp.optional(),
});
const backup = z.object({
  title: z.string().trim().min(1).max(200),
  model: z.string().max(200).nullable().optional(), modelId: z.string().max(200).optional(),
  messages: z.array(message).min(1).max(1000), createdAt: timestamp.optional(),
});

/** Import only local history, with new IDs so an export cannot overwrite a chat. */
export function readChatImport(text: string): Conversation {
  if (text.length > MAX_CHAT_IMPORT_BYTES || new TextEncoder().encode(text).byteLength > MAX_CHAT_IMPORT_BYTES) {
    throw Error("Choose an AI Studio JSON export smaller than 10 MB.");
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw Error("This file is not valid JSON. Choose an AI Studio JSON export."); }
  const parsed = backup.safeParse(value);
  if (!parsed.success) throw Error("This is not a supported AI Studio chat export. Check its messages and attachments.");
  const data = parsed.data, now = Date.now();
  return {
    id: newId(), title: data.title, modelId: data.modelId ?? data.model ?? "",
    createdAt: data.createdAt ?? now, updatedAt: now,
    messages: data.messages.map(entry => ({ ...entry, id: newId(), createdAt: entry.createdAt ?? now })),
  };
}
