import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
export const GUEST_COOKIE = "maildesk-guest-session";
export const GUEST_SECONDS = 30 * 24 * 60 * 60;
function key() {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret || secret.length < 32)
    throw Error("Guest access is not configured.");
  return secret;
}
function signature(encoded: string) {
  return createHmac("sha256", key())
    .update("maildesk.guest.v1." + encoded)
    .digest("base64url");
}
export function guestUser(token: string | undefined, now = Date.now()) {
  if (!token || token.length > 1800) return null;
  try {
    const [encoded, mac, ...extra] = token.split(".");
    if (
      !encoded ||
      !mac ||
      extra.length ||
      !/^[A-Za-z0-9_-]+$/.test(encoded) ||
      !/^[A-Za-z0-9_-]{43}$/.test(mac)
    )
      return null;
    const expected = Buffer.from(signature(encoded)),
      actual = Buffer.from(mac);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (
      payload.v !== 1 ||
      typeof payload.id !== "string" ||
      !/^guest_[a-f0-9-]{36}$/.test(payload.id) ||
      typeof payload.name !== "string" ||
      payload.name.length < 1 ||
      payload.name.length > 60 ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.iat) ||
      payload.exp <= now / 1000 ||
      payload.iat > now / 1000 + 30 ||
      payload.exp - payload.iat !== GUEST_SECONDS
    )
      return null;
    return {
      userId: payload.id,
      email: payload.id + "@maildesk.invalid",
      displayName: payload.name,
      fullName: null,
      isGuest: true as const,
    };
  } catch {
    return null;
  }
}
export function createGuestSession(
  previous?: string,
  name = "Guest",
  now = Date.now(),
) {
  const existing = guestUser(previous, now),
    userId = existing?.userId ?? "guest_" + randomUUID();
  const displayName =
    name
      .trim()
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 60) ||
    existing?.displayName ||
    "Guest";
  const iat = Math.floor(now / 1000),
    payload = {
      v: 1,
      id: userId,
      name: displayName,
      iat,
      exp: iat + GUEST_SECONDS,
    },
    encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = encoded + "." + signature(encoded);
  return { token, user: guestUser(token, now)! };
}
export function guestCookie(value: string, maxAge = GUEST_SECONDS) {
  return `${GUEST_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
