import SignIn from "@/components/sign-in";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export default async function Page() {
  const user = await getChatGPTUser();
  return <SignIn returnTo="/" signOut guestSession={!!user?.isGuest} />;
}
