import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { officeFiles, officeVersions } from "@/db/schema";
import { guard, body, json, failure, now, HttpError } from "@/lib/server";
import { officeMetadata, officeProjection } from "@/lib/office-server";
import { OFFICE_MAX_BYTES, officeUpload } from "@/lib/office-security";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, db } = await guard(request, false, OFFICE_MAX_BYTES + 20_000),
      { id } = await params;
    const where = and(
      eq(officeFiles.id, id),
      eq(officeFiles.ownerId, user.userId),
    );
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const p = z
        .object({ title: z.string().trim().min(1).max(200) })
        .safeParse(await body(request));
      if (!p.success)
        throw new HttpError(
          400,
          "Choose a file name between 1 and 200 characters.",
        );
      const [row] = await db
        .update(officeFiles)
        .set({ title: p.data.title })
        .where(where)
        .returning(officeProjection);
      if (!row) throw new HttpError(404, "File not found.");
      return json({ file: officeMetadata(row) });
    }
    let input;
    try {
      input = await officeUpload(request);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const { form, extension, data, hash } = input,
      revision = Number(form.get("revision"));
    if (!Number.isInteger(revision) || revision < 1)
      throw new HttpError(400, "Missing file revision.");
    const saved = await db.transaction(async (tx) => {
      const [current] = await tx
        .select(officeProjection)
        .from(officeFiles)
        .where(where)
        .for("update");
      if (!current) throw new HttpError(404, "File not found.");
      if (current.revision !== revision)
        throw new HttpError(
          409,
          "This file changed in another tab. Download your recovery copy and reopen the saved version.",
        );
      if (extension !== current.extension)
        throw new HttpError(400, "File type cannot change during saving.");
      if (hash === current.hash) return current;
      const timestamp = now(),
        [row] = await tx
          .update(officeFiles)
          .set({
            data: data.toString("base64"),
            hash,
            revision: sql`${officeFiles.revision}+1`,
            updatedAt: timestamp,
          })
          .where(where)
          .returning(officeProjection);
      await tx
        .insert(officeVersions)
        .values({
          fileId: id,
          ownerId: user.userId,
          revision: row.revision,
          data: data.toString("base64"),
          hash,
          createdAt: timestamp,
        });
      return row;
    });
    return json({ file: officeMetadata(saved) });
  } catch (e) {
    return failure(e);
  }
}
