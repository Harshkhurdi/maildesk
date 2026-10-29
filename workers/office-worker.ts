import type { FileContent, FileKind } from "../lib/types";
import type { OfficeExtension } from "../lib/office-format";
type Task =
  | {
      id: string;
      type: "create";
      kind: FileKind;
      title: string;
      content?: FileContent;
      template: string;
    }
  | { id: string; type: "import"; name: string; buffer: ArrayBuffer };
self.onmessage = async ({ data: task }: MessageEvent<Task>) => {
  try {
    const { createNativeFile, createCsvWorkbook, validateNativeFile } =
      await import("../lib/office-native");
    const { OFFICE_TYPES } = await import("../lib/office-format");
    let bytes: Uint8Array, extension: OfficeExtension;
    if (task.type === "create") {
      const { templateContent } = await import("../lib/office-templates");
      extension = OFFICE_TYPES[task.kind];
      bytes = await createNativeFile(
        task.kind,
        task.title,
        task.content ?? templateContent(task.kind, task.template),
      );
    } else {
      const ext = task.name.split(".").pop()?.toLowerCase();
      if (ext === "csv") {
        extension = "xlsx";
        bytes = await createCsvWorkbook(new TextDecoder().decode(task.buffer));
      } else {
        if (ext !== "docx" && ext !== "xlsx" && ext !== "pptx")
          throw Error("Choose a DOCX, XLSX, CSV, or PPTX file.");
        extension = ext;
        bytes = new Uint8Array(task.buffer);
        await validateNativeFile(bytes, extension);
      }
    }
    const buffer = Uint8Array.from(bytes).buffer;
    self.postMessage(
      { id: task.id, buffer, extension },
      { transfer: [buffer] },
    );
  } catch (e) {
    self.postMessage({ id: task.id, error: (e as Error).message });
  }
};
