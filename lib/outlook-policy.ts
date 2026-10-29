export const GOOGLE_SCOPES = {
  read: "https://www.googleapis.com/auth/gmail.readonly",
  mail: "https://www.googleapis.com/auth/gmail.modify",
  calendar: "https://www.googleapis.com/auth/calendar.events",
} as const;
export function googleCapabilities(scopes: string[] = []) {
  return {
    read:
      scopes.includes(GOOGLE_SCOPES.read) ||
      scopes.includes(GOOGLE_SCOPES.mail),
    mail: scopes.includes(GOOGLE_SCOPES.mail),
    calendar: scopes.includes(GOOGLE_SCOPES.calendar),
  };
}
export function requestedGoogleScopes(permissions: unknown) {
  if (permissions === undefined) return GOOGLE_SCOPES.read;
  if (
    !Array.isArray(permissions) ||
    permissions.some((p) => !["mail", "calendar"].includes(p))
  )
    throw Error("Choose mail or calendar permissions.");
  return [
    GOOGLE_SCOPES.read,
    ...new Set(permissions.map((p) => GOOGLE_SCOPES[p as "mail" | "calendar"])),
  ].join(" ");
}
export function safeProviderId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(value))
    throw Error("Invalid provider identifier.");
  return encodeURIComponent(value);
}
export function mailHeader(value: string) {
  if (/[\r\n\0]/.test(value))
    throw Error("Email headers cannot contain newlines.");
  return value;
}
export function emailAddresses(value: string, required = false) {
  mailHeader(value);
  const addresses = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    addresses.length > 50 ||
    (required && addresses.length === 0) ||
    addresses.some((v) => !/^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(v))
  )
    throw Error("Use comma-separated email addresses, without display names.");
  return addresses.join(", ");
}
