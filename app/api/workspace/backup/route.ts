import { eq } from "drizzle-orm";
import {
  tasks,
  files,
  utilities,
  conversations,
  conversationMessages,
  officeFiles,
} from "@/db/schema";
import { guard, failure, HttpError } from "@/lib/server";
export async function GET() {
  try {
    const { user, db } = await guard();
    const [t, f, u, c, native] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.ownerId, user.userId)).limit(2001),
      db.select().from(files).where(eq(files.ownerId, user.userId)).limit(2001),
      db
        .select()
        .from(utilities)
        .where(eq(utilities.ownerId, user.userId))
        .limit(2001),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.ownerId, user.userId))
        .limit(2001),
      db
        .select({
          id: officeFiles.id,
          title: officeFiles.title,
          kind: officeFiles.kind,
          revision: officeFiles.revision,
        })
        .from(officeFiles)
        .where(eq(officeFiles.ownerId, user.userId))
        .limit(2001),
    ]);
    const messages = await db
      .select({ message: conversationMessages })
      .from(conversationMessages)
      .innerJoin(
        conversations,
        eq(conversationMessages.roomId, conversations.id),
      )
      .where(eq(conversations.ownerId, user.userId))
      .limit(5001);
    if (
      [t, f, u, c, native].some((rows) => rows.length > 2000) ||
      messages.length > 5000
    )
      throw new HttpError(
        413,
        "This workspace is too large for one backup. Download Office files individually and export retired tables using your database provider.",
      );
    const serialized = JSON.stringify({
      exportedAt: new Date().toISOString(),
      tasks: t,
      files: f,
      utilities: u,
      conversations: c,
      messages: messages.map((r) => r.message),
      officeFiles: native,
      note: "Native Office content and historical versions are downloaded individually. AI history is exported from AI Studio. Google credentials are excluded.",
    });
    if (Buffer.byteLength(serialized) > 3_800_000)
      throw new HttpError(
        413,
        "This backup exceeds the download limit. Download Office files individually and export retired tables using your database provider.",
      );
    return new Response(serialized, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          "attachment; filename=maildesk-workspace-backup.json",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
