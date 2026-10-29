export type OfficeArchiveLimits = {
  maxBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxXmlBytes: number;
  maxTotalBytes: number;
};
const defaultLimits: OfficeArchiveLimits = {
  maxBytes: 5_000_000,
  maxEntries: 2048,
  maxEntryBytes: 8_000_000,
  maxXmlBytes: 2_000_000,
  maxTotalBytes: 32_000_000,
};
// Inspect the ZIP directory before any Office library expands its contents.
// Office files are ZIP archives; bounded uploads alone do not bound expansion.
export function checkOfficeArchive(
  input: ArrayBuffer | Uint8Array,
  limits: OfficeArchiveLimits = defaultLimits,
) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => {
    throw Error(
      "This Office file is damaged, encrypted, or unsupported. Open it in Office and save a new DOCX, PPTX, or XLSX copy.",
    );
  };
  if (bytes.length < 22 || bytes.length > limits.maxBytes) invalid();
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  if (end < 0) invalid();
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count > limits.maxEntries ||
    start + size > end
  )
    invalid();
  let at = start,
    total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > start + size || view.getUint32(at, true) !== 0x02014b50)
      invalid();
    const nameSize = view.getUint16(at + 28, true),
      extra = view.getUint16(at + 30, true),
      comment = view.getUint16(at + 32, true),
      expanded = view.getUint32(at + 24, true),
      local = view.getUint32(at + 42, true);
    const next = at + 46 + nameSize + extra + comment;
    if (next > start + size) invalid();
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameSize),
    );
    if (
      names.has(name) ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      view.getUint16(at + 8, true) & 1 ||
      local + 30 > start ||
      view.getUint32(local, true) !== 0x04034b50
    )
      invalid();
    names.add(name);
    total += expanded;
    if (
      expanded > limits.maxEntryBytes ||
      (/\.(xml|rels)$/i.test(name) && expanded > limits.maxXmlBytes) ||
      total > limits.maxTotalBytes
    )
      throw Error(
        "This Office file expands beyond the safe import limit. Save a smaller copy and try again.",
      );
    at = next;
  }
  if (at !== start + size) invalid();
  return names;
}
