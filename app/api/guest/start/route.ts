import { cookies } from "next/headers";
import { NEON_AUTH_COOKIE_PREFIX } from "@neondatabase/auth/server";
import {
  GUEST_COOKIE,
  createGuestSession,
  guestCookie,
} from "@/lib/guest-session";
import { guestRequestAllowed } from "@/lib/guest-request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!guestRequestAllowed(request))
    return Response.json(
      { error: "Start guest access from MailDesk." },
      { status: 403 },
    );
  try {
    // Stream a tiny name field; never accept identities or unsigned session data.
    const reader = request.body?.getReader();
    let body = "";
    const decoder = new TextDecoder();
    if (reader) {
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1024)
            return Response.json(
              { error: "Guest signup is too large." },
              { status: 413 },
            );
          body += decoder.decode(chunk.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    body += decoder.decode();
    const input = body ? JSON.parse(body) : {};
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      (input.name !== undefined && typeof input.name !== "string")
    )
      return Response.json({ error: "Choose a guest name." }, { status: 400 });
    const jar = await cookies(),
      session = createGuestSession(
        jar.get(GUEST_COOKIE)?.value,
        input.name ?? "Guest",
      );
    const response = Response.json(
      { url: "/", guest: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.headers.append("Set-Cookie", guestCookie(session.token));
    // Explicitly switching to guest must never continue an owner's browser session.
    for (const cookie of jar.getAll())
      if (cookie.name.startsWith(NEON_AUTH_COOKIE_PREFIX))
        response.headers.append(
          "Set-Cookie",
          `${cookie.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
        );
    return response;
  } catch (e) {
    if (e instanceof SyntaxError)
      return Response.json({ error: "Invalid guest signup." }, { status: 400 });
    return Response.json(
      { error: "Guest signup could not start. Try again." },
      { status: 503 },
    );
  }
}
