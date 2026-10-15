export class SessionUnavailableError extends Error {
  constructor() {
    super("The sign-in service is temporarily unavailable. Try again in a moment; your session has not been changed.");
    this.name = "SessionUnavailableError";
  }
}

export async function readSession<T>(load: () => Promise<{data: T | null; error?: unknown}>) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await load();
      if (!result.error) return result.data;
      const status = typeof result.error === "object" && result.error !== null && "status" in result.error
        ? result.error.status : undefined;
      if (status === 401 || status === 403) return null;
    } catch {
      // Retry the real provider once; never use an unverified fallback identity.
    }
  }
  throw new SessionUnavailableError();
}
