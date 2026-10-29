import { and, desc, eq } from "drizzle-orm";
import { files, officeFiles, officeVersions } from "@/db/schema";
import { guard, json, failure, now, uid, HttpError } from "@/lib/server";
import { officeMetadata, officeProjection } from "@/lib/office-server";
import { OFFICE_MAX_BYTES, officeUpload } from "@/lib/office-security";
export const runtime = "nodejs";
export async function GET() {
  try {
    const { user, db } = await guard();
    const rows = await db
      .select(officeProjection)
      .from(officeFiles)
      .where(eq(officeFiles.ownerId, user.userId))
      .orderBy(desc(officeFiles.updatedAt))
      .limit(500);
    return json({ files: rows.map(officeMetadata), configured: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { user, db } = await guard(request, false, OFFICE_MAX_BYTES + 20_000);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new HttpError(
        400,
        "Create or convert the file in your browser before uploading.",
      );
    let input;
    try {
      input = await officeUpload(request);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const { form, upload, extension, data, hash } = input;
    const kind =
      extension === "docx"
        ? "document"
        : extension === "xlsx"
          ? "sheet"
          : "slides";
    const title =
      String(form.get("title") || upload.name.replace(/\.[^.]+$/, ""))
        .trim()
        .slice(0, 200) || "Untitled";
    const sourceFileId =
      typeof form.get("sourceFileId") === "string"
        ? String(form.get("sourceFileId"))
        : null;
    if (sourceFileId) {
      const [source] = await db
        .select({ id: files.id, kind: files.kind })
        .from(files)
        .where(and(eq(files.id, sourceFileId), eq(files.ownerId, user.userId)));
      if (!source || source.kind !== kind)
        throw new HttpError(404, "Original file not found.");
      const [existing] = await db
        .select(officeProjection)
        .from(officeFiles)
        .where(
          and(
            eq(officeFiles.ownerId, user.userId),
            eq(officeFiles.sourceFileId, sourceFileId),
          ),
        );
      if (existing) return json({ file: officeMetadata(existing) });
    }
    const timestamp = now(),
      row = {
        id: uid(),
        ownerId: user.userId,
        title,
        kind,
        extension,
        data: data.toString("base64"),
        hash,
        sourceFileId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    const saved = await db.transaction(async (tx) => {
      const [file] = await tx
        .insert(officeFiles)
        .values(row)
        .returning(officeProjection);
      await tx
        .insert(officeVersions)
        .values({
          fileId: file.id,
          ownerId: user.userId,
          revision: 1,
          data: row.data,
          hash,
          createdAt: timestamp,
        });
      return file;
    });
    return json({ file: officeMetadata(saved) }, 201);
  } catch (e) {
    return failure(e);
  }
}
