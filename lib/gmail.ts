import { accounts } from "@/db/schema";
import { config, decrypt, unbase64, HttpError } from "@/lib/server";
import { safeUrl } from "@/lib/safe-url";
type AccountRow = typeof accounts.$inferSelect;
export class GmailError extends HttpError {}
export async function accessToken(account: AccountRow, signal?: AbortSignal) {
  const secret = await decrypt(account.token),
    c = config();
  if (typeof secret.refreshToken !== "string" || !secret.refreshToken)
    throw new GmailError(
      401,
      "This Google account is disconnected. Reconnect it to continue.",
    );
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: c.clientId!,
        client_secret: c.clientSecret!,
        refresh_token: secret.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch {
    throw new GmailError(
      503,
      "Google could not be reached to renew access. Your connection and progress are saved; try again later.",
    );
  }
  const token = (await response.json().catch(() => null)) as {
    error?: string;
    access_token?: unknown;
  } | null;
  if (!response.ok) {
    if (response.status === 429)
      throw new GmailError(
        429,
        "Google limited access renewal. Your connection and progress are saved; try again later.",
      );
    if (response.status >= 500)
      throw new GmailError(
        503,
        "Google could not renew access right now. Your connection and progress are saved; try again later.",
      );
    if (token?.error === "invalid_grant")
      throw new GmailError(
        401,
        "Google access expired or was revoked. Reconnect this account.",
      );
    if (
      token?.error === "invalid_client" ||
      token?.error === "unauthorized_client"
    )
      throw new GmailError(
        503,
        "Google connection settings need attention. Ask the workspace owner to check the OAuth client configuration.",
      );
    throw new GmailError(
      502,
      "Google could not renew access. Your connection and progress are saved; try again later.",
    );
  }
  if (typeof token?.access_token !== "string" || !token.access_token)
    throw new GmailError(
      502,
      "Google did not return an access token. Try again later.",
    );
  return token.access_token;
}
export function decodePart(value: string) {
  try {
    return new TextDecoder().decode(unbase64(value));
  } catch {
    return "";
  }
}
export function htmlToText(html: string) {
  return html
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href, label) => {
        const link = safeUrl(href.replace(/&amp;/g, "&"));
        return label + (link ? " (" + link + ")" : "");
      },
    )
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(?:td|th)\s*>/gi, "\t")
    .replace(
      /<br\s*\/?\s*>|<\/?(?:p|div|li|tr|h[1-6]|section|article|header|footer|main|aside|blockquote|ul|ol|table|address|figure|figcaption)\b[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (match, digits) => {
      const point =
        digits[0].toLowerCase() === "x"
          ? parseInt(digits.slice(1), 16)
          : Number(digits);
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n");
}
