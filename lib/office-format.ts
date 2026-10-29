export const OFFICE_MAX_BYTES = 3_000_000;
export const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export type OfficeExtension = keyof typeof OFFICE_MIME;
export const OFFICE_TYPES = {
  document: "docx",
  sheet: "xlsx",
  slides: "pptx",
} as const;
export const NATIVE_ARCHIVE_LIMITS = {
  maxBytes: OFFICE_MAX_BYTES,
  maxEntries: 4096,
  maxEntryBytes: 32_000_000,
  maxXmlBytes: 16_000_000,
  maxTotalBytes: 64_000_000,
};
