export function readCodeBackup(text: string) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 120 ||
      !Array.isArray(value.files) || value.files.length < 1 || value.files.length > 30 ||
      value.files.some((f: {name?: unknown; content?: unknown} | null) => !f || typeof f.name !== "string" ||
        !/^[a-zA-Z0-9_ .-]{1,80}$/.test(f.name) || !f.name.trim() || typeof f.content !== "string" || f.content.length > 850000) ||
      new Set(value.files.map((f: {name: string}) => f.name)).size !== value.files.length) return null;
    return {title: value.title, files: value.files as {name: string; content: string}[]};
  } catch {
    return null;
  }
}
