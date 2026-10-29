import { and, eq, sql, count } from "drizzle-orm";
import { accounts, oauthStates } from "@/db/schema";
import { guard, config, encrypt, uid, now, HttpError } from "@/lib/server";
export async function GET(request: Request) {
  const c = config();
  const destination = `${c.origin ?? new URL(request.url).origin}/?settings=1`;
  function done(error?: string) {
    const r = Response.redirect(
      destination +
        (error
          ? `&connection_error=${encodeURIComponent(error)}`
          : "&connected=1"),
      303,
    );
    const h = new Headers(r.headers);
    h.set("Cache-Control", "no-store");
    h.set(
      "Set-Cookie",
      "maildesk_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail/callback; Max-Age=0",
    );
    return new Response(null, { status: 303, headers: h });
  }
  try {
    const { user, db } = await guard();
    const p = new URL(request.url).searchParams;
    const state = p.get("state"),
      code = p.get("code");
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("maildesk_oauth="))
      ?.slice(15);
    if (!state || state !== cookie)
      throw new HttpError(
        400,
        "Connection expired. Please connect the account again.",
      );
    const [s] = await db
      .delete(oauthStates)
      .where(
        and(eq(oauthStates.id, state), eq(oauthStates.ownerId, user.userId)),
      )
      .returning();
    if (!s || s.expiresAt < Date.now())
      throw new HttpError(
        400,
        "Connection expired. Please connect the account again.",
      );
    if (!code || p.get("error"))
      throw new HttpError(400, "Google connection was cancelled or denied.");
    // The reconnect target comes only from the consumed, owner-bound state.
    let reconnect: typeof accounts.$inferSelect | undefined;
    if (s.id.startsWith("gmail-reconnect:")) {
      const parts = s.id.split(":");
      if (parts.length !== 3 || !parts[1])
        throw new HttpError(
          400,
          "Connection expired. Please connect the account again.",
        );
      [reconnect] = await db
        .select()
        .from(accounts)
        .where(
          and(eq(accounts.id, parts[1]), eq(accounts.ownerId, user.userId)),
        );
      if (!reconnect)
        throw new HttpError(
          404,
          "The account to reconnect is no longer available.",
        );
    }
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: c.clientId!,
        client_secret: c.clientSecret!,
        redirect_uri: `${c.origin}/api/gmail/callback`,
        grant_type: "authorization_code",
        code_verifier: s.verifier,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const token = (await r.json()) as {
      refresh_token?: string;
      scope?: string;
      access_token?: string;
    };
    if (!r.ok || !token.refresh_token)
      throw new HttpError(
        400,
        "Google did not grant offline access. Reconnect and approve the requested Google permissions.",
      );
    if (
      !String(token.scope ?? "")
        .split(" ")
        .some((scope) =>
          [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.modify",
          ].includes(scope),
        )
    )
      throw new HttpError(400, "Gmail permission was not granted.");
    const profileResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!profileResponse.ok)
      throw new HttpError(400, "Could not read the Gmail account profile.");
    const profile = (await profileResponse.json()) as { emailAddress?: string };
    if (typeof profile.emailAddress !== "string" || !profile.emailAddress)
      throw new HttpError(
        400,
        "Google returned an incomplete account profile.",
      );
    const email = profile.emailAddress.toLowerCase();
    if (reconnect && email !== reconnect.email.toLowerCase())
      throw new HttpError(
        400,
        `Choose ${reconnect.email} when reconnecting this account. Its saved connection has not been changed.`,
      );
    const encrypted = await encrypt({
      refreshToken: token.refresh_token,
      scopes: String(token.scope ?? "").split(" "),
    });
    const existing =
      reconnect ??
      (
        await db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.ownerId, user.userId), eq(accounts.email, email)),
          )
      )[0];
    if (existing)
      await db
        .update(accounts)
        .set({ token: encrypted, error: null, phase: "recent" })
        .where(
          and(eq(accounts.id, existing.id), eq(accounts.ownerId, user.userId)),
        );
    else
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${user.userId}))`,
        );
        const [total] = await tx
          .select({ n: count() })
          .from(accounts)
          .where(eq(accounts.ownerId, user.userId));
        if (total.n >= 10)
          throw new HttpError(400, "All ten account slots are in use.");
        await tx
          .insert(accounts)
          .values({
            id: uid(),
            ownerId: user.userId,
            email,
            token: encrypted,
            historyId: null,
            phase: "recent",
            queue: "[]",
            scanned: 0,
            total: 0,
            leaseUntil: 0,
            createdAt: now(),
          });
      });
    return done();
  } catch (e) {
    return done(
      e instanceof HttpError
        ? e.message
        : "Google connection failed. Please retry from Settings.",
    );
  }
}
