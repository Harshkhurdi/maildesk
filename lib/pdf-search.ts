export function pdfPageText(items: readonly unknown[]): string {
  return items.map(item => {
    if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") return "";
    return item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ");
  }).join("");
}

export function normalizePdfSearchText(text: string): string {
  return text.replace(/\s+/g," ").trim();
}

export function pdfSearchMatch(pageText: string, query: string) {
  const text = normalizePdfSearchText(pageText), term = normalizePdfSearchText(query).toLocaleLowerCase();
  if (!term) return null;
  const lower = text.toLocaleLowerCase(), at = lower.indexOf(term);
  if (at < 0) return null;
  let count = 0, position = 0;
  while ((position = lower.indexOf(term,position)) >= 0) { count++; position += term.length; }
  return {
    count,
    snippet: (at > 45 ? "…" : "") + text.slice(Math.max(0,at-45),at+term.length+100) +
      (at+term.length+100 < text.length ? "…" : ""),
  };
}
