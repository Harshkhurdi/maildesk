import { and, eq } from "drizzle-orm";
import { officeVersions } from "@/db/schema";
import { guard, failure, HttpError } from "@/lib/server";
import { ownedOfficeFile } from "@/lib/office-server";
import { OFFICE_MIME, type OfficeExtension } from "@/lib/office-format";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, db } = await guard(request),
      { id } = await params,
      row = await ownedOfficeFile(id, user.userId);
    const query = new URL(request.url).searchParams.get("revision"),
      revision = query === null ? row.revision : Number(query);
    if (!Number.isInteger(revision) || revision < 1)
      throw new HttpError(400, "Invalid file revision.");
    const [version] = await db
      .select({ data: officeVersions.data })
      .from(officeVersions)
      .where(
        and(
          eq(officeVersions.fileId, id),
          eq(officeVersions.ownerId, user.userId),
          eq(officeVersions.revision, revision),
        ),
      );
    if (!version) throw new HttpError(404, "Version not found.");
    return new Response(Buffer.from(version.data, "base64"), {
      headers: {
        "Content-Type": OFFICE_MIME[row.extension as OfficeExtension],
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.title + "." + row.extension)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
