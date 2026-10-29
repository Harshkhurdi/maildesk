import { WorkspaceProvider } from "@/components/workspace-identity";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/server";
import PdfWorkspace from "@/components/pdf-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/pdf");
  return (
    <WorkspaceProvider
      identity={{
        userId: user.userId,
        isOwner: isWorkspaceOwner(user),
        isGuest: !!user.isGuest,
      }}
    >
      <PdfWorkspace />
    </WorkspaceProvider>
  );
}
