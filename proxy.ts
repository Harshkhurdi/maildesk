import { GUEST_COOKIE, guestUser } from "@/lib/guest-session";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth-server";
export default async function proxy(request: NextRequest) {
  if (guestUser(request.cookies.get(GUEST_COOKIE)?.value))
    return NextResponse.next();
  return auth().middleware({ loginUrl: "/auth/sign-in" })(request);
}
export const config = { matcher: ["/", "/ai-studio/:path*"] };
