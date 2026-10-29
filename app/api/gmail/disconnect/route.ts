import { and, eq } from "drizzle-orm";
import { accounts } from "@/db/schema";
import {
  guard,
  body,
  json,
  failure,
  HttpError,
  decrypt,
  encrypt,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    const { user, db } = await guard(request),
      p = await body(request);
    if (typeof p.accountId !== "string")
      throw new HttpError(400, "Choose an account.");
    const predicate = and(
      eq(accounts.id, p.accountId),
      eq(accounts.ownerId, user.userId),
    );
    const [row] = await db.select().from(accounts).where(predicate);
    if (!row) throw new HttpError(404, "Account not found.");
    let revoked = false;
    try {
      const token = await decrypt(row.token);
      if (token.refreshToken)
        revoked = (
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            body: new URLSearchParams({ token: token.refreshToken }),
            signal: AbortSignal.timeout(15_000),
          })
        ).ok;
    } catch {
      /* Local access is disabled even if Google's revocation service is unavailable. */
    }
    const [saved] = await db
      .update(accounts)
      .set({
        token: await encrypt({ refreshToken: null, scopes: [] }),
        phase: "disconnected",
        error: "Disconnected. Reconnect this account to enable Google access.",
      })
      .where(and(predicate, eq(accounts.token, row.token)))
      .returning({ id: accounts.id });
    if (!saved)
      throw new HttpError(
        409,
        "This connection changed while disconnecting. Refresh account settings.",
      );
    return json({
      disconnected: true,
      revoked,
      message: revoked
        ? "Google access disconnected. Your saved work and earlier records are kept."
        : "Local access disconnected. Google revocation could not be confirmed; remove MailDesk access in your Google Account settings. Your saved work is kept.",
    });
  } catch (e) {
    return failure(e);
  }
}
