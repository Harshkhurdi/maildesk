import "server-only";
import { GUEST_COOKIE, guestUser } from "@/lib/guest-session";
import { cookies, headers } from "next/headers";
import {
  extractNeonAuthCookies,
  NEON_AUTH_COOKIE_PREFIX,
  NEON_AUTH_SESSION_COOKIE_NAME,
  parseSetCookies,
} from "@neondatabase/auth/server";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { auth } from "@/lib/auth-server";
import { readSession } from "@/lib/session-reader";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function verifiedUser(data: unknown): ChatGPTUser | null {
  if (data === null) return null;
  if (!record(data)) throw Error("Invalid session response.");
  if (data.session === null && data.user === null) return null;
  const s = data.session,
    u = data.user;
  if (
    !record(s) ||
    !record(u) ||
    typeof u.id !== "string" ||
    !u.id.trim() ||
    typeof u.email !== "string" ||
    !u.email.trim() ||
    typeof u.emailVerified !== "boolean" ||
    !(u.name === null || typeof u.name === "string") ||
    typeof s.id !== "string" ||
    !s.id.trim() ||
    s.userId !== u.id ||
    !validDate(s.expiresAt) ||
    !validDate(s.createdAt) ||
    !validDate(s.updatedAt) ||
    !validDate(u.createdAt) ||
    !validDate(u.updatedAt)
  )
    throw Error("Invalid session response.");
  if (!u.emailVerified || Date.parse(s.expiresAt as string) <= Date.now())
    return null;
  return {
    userId: u.id,
    email: u.email,
    displayName: u.name || u.email,
    fullName: u.name || null,
  };
}

// Route handlers can persist the SDK's signed cache renewal; page rendering cannot.
export async function getRouteChatGPTUser(
  request?: Request,
): Promise<ChatGPTUser | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const guest = guestUser(cookieStore.get(GUEST_COOKIE)?.value);
  if (!cookieStore.get(NEON_AUTH_SESSION_COOKIE_NAME)?.value) return guest;
  const origin =
    process.env.APP_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    request?.url ||
    `${headerStore.get("x-forwarded-proto") || "https"}://${headerStore.get("host")}`;
  const sessionUrl = new URL("/api/auth/get-session", origin);
  const result = await readSession(async () => {
    const sessionRequest = new Request(sessionUrl, {
      method: "GET",
      headers: {
        cookie: extractNeonAuthCookies(cookieStore.toString()),
        origin: sessionUrl.origin,
      },
    });
    const response = await auth()
      .handler()
      .GET(sessionRequest, {
        params: Promise.resolve({ path: ["get-session"] }),
      });
    if (!response.ok) return { data: null, error: { status: response.status } };
    const user = verifiedUser(await response.json());
    if (!user) return { data: null };
    const renewedCookies = response.headers
      .getSetCookie()
      .flatMap((value) => parseSetCookies(value))
      .filter((cookie) => cookie.name.startsWith(NEON_AUTH_COOKIE_PREFIX));
    return { data: { user, renewedCookies } };
  });
  if (!result) return guest;
  // Never persist cookies from rejected, malformed, or unverified responses.
  for (const cookie of result.renewedCookies) {
    const { name, value, ...options } = cookie;
    cookieStore.set(name, value, options);
  }
  return result.user;
}
