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
    color: "#185abd",
    description: "Write, review, and refine.",
  },
  {
    id: "sheet",
    name: "Excel",
    letter: "X",
    color: "#107c41",
    description: "Find the story in your numbers.",
  },
  {
    id: "slides",
    name: "PowerPoint",
    letter: "P",
    color: "#c43e1c",
    description: "Give your ideas a stage.",
  },
  {
    id: "outlook",
    name: "Outlook",
    letter: "O",
    color: "#0078d4",
    description: "Your mail and calendar, together.",
  },
  {
    id: "ai",
    name: "Free AI Studio",
    letter: "✦",
    color: "#6554c0",
    description: "A little help with the next idea.",
  },
] as const;
