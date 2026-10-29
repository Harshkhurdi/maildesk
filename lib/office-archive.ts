import JSZip from "jszip";
import {
  checkOfficeArchive,
  type OfficeArchiveLimits,
} from "./office-directory.ts";
export { checkOfficeArchive } from "./office-directory.ts";
const defaultLimits = {
  maxBytes: 5_000_000,
  maxEntries: 2048,
  maxEntryBytes: 8_000_000,
  maxXmlBytes: 2_000_000,
  maxTotalBytes: 32_000_000,
};
export async function readOfficeArchive(
  input: ArrayBuffer | Uint8Array,
  limits: OfficeArchiveLimits = defaultLimits,
) {
  checkOfficeArchive(input, limits);
  const zip = await JSZip.loadAsync(input);
  let total = 0;
  // Also check actual streamed output: a corrupt directory may lie about size.
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const limit = /\.(xml|rels)$/i.test(entry.name)
      ? limits.maxXmlBytes
      : limits.maxEntryBytes;
    await new Promise<void>((resolve, reject) => {
      // JSZip documents this API but omits it from JSZipObject's declarations.
      const streamed = entry as JSZip.JSZipObject & {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      };
      let size = 0;
      const stream = streamed.internalStream("uint8array");
      stream
        .on("data", (chunk) => {
          size += chunk.length;
          total += chunk.length;
          if (size > limit || total > limits.maxTotalBytes) {
            stream.pause();
            reject(
              Error(
                "This Office file expands beyond the safe import limit. Save a smaller copy and try again.",
              ),
            );
          }
        })
        .on("error", reject)
        .on("end", resolve)
        .resume();
    });
  }
  return zip;
}
