import { eq, desc } from "drizzle-orm";
import { accounts, files } from "@/db/schema";
import { guard, json, failure, ready, config } from "@/lib/server";
export async function GET() {
  try {
    const { user, db } = await guard();
    const [a, f] = await Promise.all([
      db
        .select({
          id: accounts.id,
          email: accounts.email,
          syncedAt: accounts.syncedAt,
          error: accounts.error,
        })
        .from(accounts)
        .where(eq(accounts.ownerId, user.userId)),
      db
        .select({
          id: files.id,
          kind: files.kind,
          title: files.title,
          updatedAt: files.updatedAt,
        })
        .from(files)
        .where(eq(files.ownerId, user.userId))
        .orderBy(desc(files.updatedAt))
        .limit(500),
    ]);
    return json({
      accounts: a,
      legacyFiles: f,
      configured: ready(),
      callbackUrl: `${config().origin ?? ""}/api/gmail/callback`,
      userName: user.displayName,
    });
  } catch (e) {
    return failure(e);
  }
}
