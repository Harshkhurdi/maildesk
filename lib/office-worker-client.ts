import type { FileContent, FileKind } from "./types";
import { OFFICE_MIME, type OfficeExtension } from "./office-format";
type Input =
  | {
      type: "create";
      kind: FileKind;
      title: string;
      content?: FileContent;
      template: string;
    }
  | { type: "import"; name: string; buffer: ArrayBuffer };
// A short-lived worker keeps archive parsing/conversion off the UI and off Vercel.
export function prepareOfficeFile(input: Input): Promise<File> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
        new URL("../workers/office-worker.ts", import.meta.url),
      ),
      id = crypto.randomUUID();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Error("Conversion took too long. Try a smaller file."));
    }, 90_000);
    const done = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onerror = () => {
      done();
      reject(
        Error(
          "The browser could not convert this file. Try again or import a native Office file.",
        ),
      );
    };
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      id: string;
      error?: string;
      buffer: ArrayBuffer;
      extension: OfficeExtension;
    }>) => {
      if (data.id !== id) return;
      done();
      if (data.error) reject(Error(data.error));
      else
        resolve(
          new File(
            [data.buffer],
            `${input.type === "create" ? input.title : input.name.replace(/\.[^.]+$/, "")}.${data.extension}`,
            { type: OFFICE_MIME[data.extension] },
          ),
        );
    };
    worker.postMessage(
      { ...input, id },
      input.type === "import" ? [input.buffer] : [],
    );
  });
}
