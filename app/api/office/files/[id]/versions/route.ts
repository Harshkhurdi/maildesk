import { and, eq, desc } from "drizzle-orm";
import { officeVersions } from "@/db/schema";
import { guard, json, failure } from "@/lib/server";
import { ownedOfficeFile } from "@/lib/office-server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, db } = await guard(),
      { id } = await params;
    await ownedOfficeFile(id, user.userId);
    const versions = await db
      .select({
        revision: officeVersions.revision,
        createdAt: officeVersions.createdAt,
      })
      .from(officeVersions)
      .where(
        and(
          eq(officeVersions.fileId, id),
          eq(officeVersions.ownerId, user.userId),
        ),
      )
      .orderBy(desc(officeVersions.revision))
      .limit(200);
    return json({ versions });
  } catch (e) {
    return failure(e);
  }
}
