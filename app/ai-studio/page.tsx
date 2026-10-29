import { WorkspaceProvider } from "@/components/workspace-identity";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/server";
import AIStudio from "@/components/ai-studio/workspace";
import "./studio.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/ai-studio");
  return (
    <WorkspaceProvider
      key={user.userId}
      identity={{
        userId: user.userId,
        isOwner: isWorkspaceOwner(user),
        isGuest: !!user.isGuest,
      }}
    >
      <AIStudio />
    </WorkspaceProvider>
  );
}
