// Guest session creation/removal is state changing even before an account exists.
export function guestRequestAllowed(request: Request) {
  try {
    const configured =
      process.env.APP_ORIGIN ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : new URL(request.url).origin);
    if (
      request.headers.get("origin") !== new URL(configured).origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return false;
    return Number(request.headers.get("content-length") ?? 0) <= 1024;
  } catch {
    return false;
  }
}
