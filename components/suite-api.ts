export async function suiteApi<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  payload?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers:
      payload instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      payload === undefined
        ? undefined
        : payload instanceof FormData
          ? payload
          : JSON.stringify(payload),
    signal,
    cache: "no-store",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "The server returned an incomplete response." }));
  if (!response.ok)
    throw Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}
export type NativeFile = {
  id: string;
  kind: "document" | "sheet" | "slides";
  title: string;
  extension: string;
  revision: number;
  hash: string;
  updatedAt: string;
  createdAt: string;
  sourceFileId: string | null;
};
export const apps = [
  {
    id: "document",
    name: "Word",
    letter: "W",
    color: "#2864bc",
    description: "Write, review, and refine.",
  },
  {
    id: "sheet",
    name: "Excel",
    letter: "X",
    color: "#24734e",
    description: "Find the story in your numbers.",
  },
  {
    id: "slides",
    name: "PowerPoint",
    letter: "P",
    color: "#bc5a38",
    description: "Give your ideas a stage.",
  },
  {
    id: "outlook",
    name: "Outlook",
    letter: "O",
    color: "#2671b8",
    description: "Your mail and calendar, together.",
  },
  {
    id: "ai",
    name: "Free AI Studio",
    letter: "✦",
    color: "#7960a9",
    description: "A little help with the next idea.",
  },
] as const;
