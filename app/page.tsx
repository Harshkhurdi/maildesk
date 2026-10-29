import { WorkspaceProvider } from "@/components/workspace-identity";
import { requireChatGPTUser } from "./chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/server";
import Maildesk from "@/components/maildesk-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/");
  return (
    <WorkspaceProvider
      key={user.userId}
      identity={{
        userId: user.userId,
        isOwner: isWorkspaceOwner(user),
        isGuest: !!user.isGuest,
      }}
    >
      <Maildesk />
    </WorkspaceProvider>
  );
}
