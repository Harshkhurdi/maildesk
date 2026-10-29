import { guestCookie } from "@/lib/guest-session";
import { guestRequestAllowed } from "@/lib/guest-request";
export async function POST(request: Request) {
  if (!guestRequestAllowed(request))
    return Response.json({ error: "Sign out from MailDesk." }, { status: 403 });
  return Response.json(
    { signedOut: true },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Set-Cookie": guestCookie("", 0),
      },
    },
  );
}
