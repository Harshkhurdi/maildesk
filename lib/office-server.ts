import { and, eq } from "drizzle-orm";
import { officeFiles } from "@/db/schema";
import { HttpError } from "@/lib/server";
import { getDb } from "@/db";
export const officeProjection = {
  id: officeFiles.id,
  ownerId: officeFiles.ownerId,
  kind: officeFiles.kind,
  title: officeFiles.title,
  extension: officeFiles.extension,
  hash: officeFiles.hash,
  revision: officeFiles.revision,
  sourceFileId: officeFiles.sourceFileId,
  createdAt: officeFiles.createdAt,
  updatedAt: officeFiles.updatedAt,
};
export type OfficeMetadataRow = Omit<typeof officeFiles.$inferSelect, "data">;
export async function ownedOfficeFile(id: string, ownerId: string) {
  const [row] = await getDb()
    .select(officeProjection)
    .from(officeFiles)
    .where(and(eq(officeFiles.id, id), eq(officeFiles.ownerId, ownerId)));
  if (!row) throw new HttpError(404, "File not found.");
  return row;
}
export function officeMetadata(row: OfficeMetadataRow) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    extension: row.extension,
    hash: row.hash,
    revision: row.revision,
    sourceFileId: row.sourceFileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
