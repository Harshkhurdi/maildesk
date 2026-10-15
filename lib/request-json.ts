export function parseJsonObject(text: string) {
  const value = JSON.parse(text);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SyntaxError("A JSON object is required.");
  }
  return value;
}
