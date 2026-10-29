import { createHash } from "node:crypto";
import { checkOfficeArchive } from "./office-directory.ts";
import {
  NATIVE_ARCHIVE_LIMITS,
  type OfficeExtension,
} from "./office-format.ts";
export * from "./office-format.ts";
// Server checks only bounded directory metadata and hashes bytes. Archive expansion and
// document conversion run in a browser worker, never in a Vercel Function.
export function inspectNativeFile(
  data: Uint8Array,
  extension: OfficeExtension,
) {
  const names = checkOfficeArchive(data, NATIVE_ARCHIVE_LIMITS);
  const root = {
    docx: "word/document.xml",
    xlsx: "xl/workbook.xml",
    pptx: "ppt/presentation.xml",
  }[extension];
  if (!names.has("[Content_Types].xml") || !names.has(root))
    throw Error("File contents do not match the Office extension.");
  if ([...names].some((n) => /vbaProject|activeX\//i.test(n)))
    throw Error("Save a macro-free Office copy.");
  return createHash("sha256").update(data).digest("hex");
}
export async function readLimited(response: Response, limit: number) {
  if (!response.ok || !response.body)
    throw Error("The file could not be read.");
  if (Number(response.headers.get("content-length")) > limit)
    throw Error("This file exceeds the storage limit.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw Error("This file exceeds the storage limit.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export async function officeUpload(request: Request) {
  const bytes = await readLimited(new Response(request.body), 3_020_000);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type")! },
    body: bytes,
  }).formData();
  const upload = form.get("file");
  if (!(upload instanceof File))
    throw Error("Choose a DOCX, XLSX or PPTX file.");
  const extension = upload.name.split(".").pop()?.toLowerCase();
  if (extension !== "docx" && extension !== "xlsx" && extension !== "pptx")
    throw Error(
      "Choose a DOCX, XLSX or PPTX file. CSV conversion runs in your browser.",
    );
  const data = Buffer.from(await upload.arrayBuffer());
  const hash = inspectNativeFile(data, extension);
  return { form, upload, extension, data, hash };
}
