import { and, eq, ne } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { guard, json, failure, decrypt } from "@/lib/server";
import { googleCapabilities, GOOGLE_SCOPES } from "@/lib/outlook-policy";
export async function GET() {
  try {
    const { user, db } = await guard();
    const rows = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.ownerId, user.userId),
          ne(accounts.phase, "disconnected"),
        ),
      );
    return json({
      accounts: await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          email: row.email,
          syncedAt: row.syncedAt,
          capabilities: googleCapabilities(
            (await decrypt(row.token)).scopes ?? [GOOGLE_SCOPES.read],
          ),
        })),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
