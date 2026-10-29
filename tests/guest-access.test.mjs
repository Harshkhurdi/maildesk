import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  NEON_AUTH_COOKIE_PREFIX,
  NEON_AUTH_SESSION_COOKIE_NAME,
} from "@neondatabase/auth/server";
import {
  createGuestSession,
  guestUser,
  guestCookie,
  GUEST_COOKIE,
  GUEST_SECONDS,
} from "../lib/guest-session.ts";
import { guestRequestAllowed } from "../lib/guest-request.ts";
import { isolated } from "./suite-fixture.mjs";
const saved = {
  secret: process.env.NEON_AUTH_COOKIE_SECRET,
  origin: process.env.APP_ORIGIN,
};
process.env.NEON_AUTH_COOKIE_SECRET =
  "fixture-guest-secret-keep-private-0123456789";
process.env.APP_ORIGIN = "https://workspace.example.test";
after(() => {
  for (const [key, value] of [
    ["NEON_AUTH_COOKIE_SECRET", saved.secret],
    ["APP_ORIGIN", saved.origin],
  ])
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});
const request = (data = {}, origin = "https://workspace.example.test") =>
  new Request("https://workspace.example.test/api/guest/start", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
async function route(cookieList = []) {
  return isolated("../app/api/guest/start/route.ts", {
    cookies: async () => ({
      get: (name) => cookieList.find((c) => c.name === name),
      getAll: () => cookieList,
    }),
    NEON_AUTH_COOKIE_PREFIX,
    GUEST_COOKIE,
    createGuestSession,
    guestCookie,
    guestRequestAllowed,
  });
}
function token(response) {
  return response.headers
    .getSetCookie()
    .find((c) => c.startsWith(GUEST_COOKIE + "="))
    .split(";")[0]
    .slice(GUEST_COOKIE.length + 1);
}
test("guest identities are unique, signed, expiring and cannot be changed into the owner", () => {
  const now = Date.now(),
    first = createGuestSession(undefined, "Visitor", now),
    second = createGuestSession(undefined, "Visitor", now);
  assert.notEqual(first.user.userId, second.user.userId);
  assert.match(first.user.userId, /^guest_/);
  assert.equal(first.user.isGuest, true);
  assert.equal(guestUser(first.token, now).displayName, "Visitor");
  assert.equal(guestUser(first.token, now + GUEST_SECONDS * 1000), null);
  assert.equal(guestUser(first.token, now - 60_000), null);
  const [payload, signature] = first.token.split("."),
    forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url")),
        id: "owner",
      }),
    ).toString("base64url");
  for (const bad of [
    forged + "." + signature,
    first.token + "x",
    "unsigned",
    ".".repeat(2000),
    first.token + ".extra",
  ])
    assert.equal(guestUser(bad, now), null);
  const original = process.env.NEON_AUTH_COOKIE_SECRET;
  process.env.NEON_AUTH_COOKIE_SECRET =
    "different-secret-keep-private-0123456789";
  assert.equal(guestUser(first.token, now), null);
  process.env.NEON_AUTH_COOKIE_SECRET = original;
});
test("resuming a valid browser guest preserves their workspace identity", () => {
  const first = createGuestSession(undefined, "Guest A");
  const resumed = createGuestSession(first.token, "Guest A");
  assert.equal(resumed.user.userId, first.user.userId);
  assert.equal(resumed.user.email, first.user.email);
});
test("guest signup creates only a scoped HTTP-only session and clears prior Neon browser identity", async () => {
  const old = createGuestSession(),
    r = await route([
      { name: GUEST_COOKIE, value: old.token },
      { name: NEON_AUTH_SESSION_COOKIE_NAME, value: "owner-session" },
      { name: NEON_AUTH_COOKIE_PREFIX + ".session_data", value: "owner-cache" },
      { name: "unrelated", value: "keep" },
    ]);
  const response = await r.POST(
    request({
      name: "Guest visitor",
      userId: "owner",
      email: "owner@example.test",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: "/", guest: true });
  const user = guestUser(token(response));
  assert.equal(user.userId, old.user.userId);
  assert.equal(user.displayName, "Guest visitor");
  assert.notEqual(user.email, "owner@example.test");
  const all = response.headers.getSetCookie();
  assert.match(all[0], /HttpOnly/);
  assert.match(all[0], /SameSite=Lax/);
  assert.match(all[0], /Path=\//);
  assert(
    all.some(
      (c) =>
        c.startsWith(NEON_AUTH_SESSION_COOKIE_NAME + "=;") &&
        c.includes("Max-Age=0"),
    ),
  );
  assert(!all.some((c) => c.startsWith("unrelated=")));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("signup rejects cross-site, oversized and malformed requests before accepting a session", async () => {
  const r = await route();
  assert.equal(
    (await r.POST(request({}, "https://attacker.test"))).status,
    403,
  );
  assert.equal(
    (
      await r.POST(
        new Request("https://workspace.example.test/api/guest/start", {
          method: "POST",
        }),
      )
    ).status,
    403,
  );
  assert.equal((await r.POST(request({ name: 42 }))).status, 400);
  assert.equal((await r.POST(request({ name: "x".repeat(2000) }))).status, 413);
  const malformed = new Request(
    "https://workspace.example.test/api/guest/start",
    { method: "POST", headers: { origin: process.env.APP_ORIGIN }, body: "{" },
  );
  assert.equal((await r.POST(malformed)).status, 400);
});
test("ending a guest session clears only the guest cookie and preserves CSRF protection", async () => {
  const r = await isolated("../app/api/guest/end/route.ts", {
    guestCookie,
    guestRequestAllowed,
  });
  assert.equal(
    (await r.POST(request({}, "https://attacker.test"))).status,
    403,
  );
  const response = await r.POST(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /maildesk-guest-session=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});
test("guest pages and routes authenticate without a Neon request and tampered sessions stay signed out", async () => {
  const session = createGuestSession();
  let calls = 0,
    current = session.token;
  const jar = {
    get: (name) => (name === GUEST_COOKIE ? { value: current } : undefined),
  };
  const r = await isolated("../lib/route-session.ts", {
    GUEST_COOKIE,
    guestUser,
    cookies: async () => jar,
    headers: async () => new Headers(),
    NEON_AUTH_SESSION_COOKIE_NAME,
    auth: () => {
      calls++;
      throw Error("Guest must not contact Neon");
    },
  });
  assert.equal((await r.getRouteChatGPTUser()).userId, session.user.userId);
  assert.equal(calls, 0);
  current += "tampered";
  assert.equal(await r.getRouteChatGPTUser(), null);
  assert.equal(calls, 0);
});
test("proxy bypass accepts signed guests only; forged guest cookies still use normal authentication", async () => {
  const session = createGuestSession();
  let calls = 0;
  const r = await isolated("../proxy.ts", {
    GUEST_COOKIE,
    guestUser,
    NextResponse: { next: () => ({ guestAccepted: true }) },
    auth: () => ({
      middleware: () => () => {
        calls++;
        return { normalAuthentication: true };
      },
    }),
  });
  const fake = (value) => ({ cookies: { get: () => ({ value }) } });
  assert.deepEqual(await r.default(fake(session.token)), {
    guestAccepted: true,
  });
  assert.equal(calls, 0);
  assert.deepEqual(await r.default(fake("forged")), {
    normalAuthentication: true,
  });
  assert.equal(calls, 1);
});
