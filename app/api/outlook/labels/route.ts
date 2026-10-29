import { z } from "zod";
import { guard, json, failure, body, HttpError } from "@/lib/server";
import { outlookAccount } from "@/lib/outlook";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { user } = await guard(),
      { api } = await outlookAccount(
        new URL(request.url).searchParams.get("accountId") ?? "",
        user.userId,
      );
    return json(await api("gmail", "labels"));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user } = await guard(request),
      p = z
        .object({
          accountId: z.string(),
          name: z.string().trim().min(1).max(100),
        })
        .safeParse(await body(request));
    if (!p.success) throw new HttpError(400, "Enter a folder name.");
    const { api } = await outlookAccount(p.data.accountId, user.userId, "mail");
    return json(
      await api("gmail", "labels", {
        method: "POST",
        body: JSON.stringify({
          name: p.data.name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
