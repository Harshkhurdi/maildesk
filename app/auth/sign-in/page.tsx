import SignIn from "@/components/sign-in";
import { safeReturnPath } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; signup?: string }>;
}) {
  const p = await searchParams;
  return (
    <SignIn
      signup={p.signup === "1"}
      returnTo={safeReturnPath(p.return_to ?? "/")}
    />
  );
}
