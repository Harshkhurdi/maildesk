import { guard, failure, HttpError } from "@/lib/server";
import { outlookAccount, normalizeMessage } from "@/lib/outlook";
import { safeProviderId } from "@/lib/outlook-policy";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { user } = await guard(),
      q = new URL(request.url).searchParams,
      messageId = safeProviderId(q.get("messageId") ?? "");
    const { api } = await outlookAccount(q.get("accountId") ?? "", user.userId);
    const message = normalizeMessage(
      await api("gmail", `messages/${messageId}?format=full`),
    );
    // Attachment ID, name and type come from this owned provider message, not caller-supplied metadata.
    const index = Number(q.get("index"));
    if (!Number.isInteger(index) || index < 0)
      throw new HttpError(400, "Choose an attachment.");
    const attachment = message.attachments[index];
    if (!attachment) throw new HttpError(404, "Attachment not found.");
    if (attachment.size > 3_000_000)
      throw new HttpError(
        413,
        "Download attachments above 3 MB directly from Gmail.",
      );
    const result = attachment.inlineData
      ? { data: attachment.inlineData }
      : await api(
          "gmail",
          `messages/${messageId}/attachments/${safeProviderId(attachment.id)}`,
        );
    const data = Buffer.from(result.data ?? "", "base64url");
    if (data.length > 3_000_000)
      throw new HttpError(413, "Attachment exceeds the 3 MB download limit.");
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
