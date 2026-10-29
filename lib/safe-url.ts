export function safeUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 4096) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
