import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ConversationHub from "@/components/conversation-hub";
export const dynamic="force-dynamic";
export default async function Page(){await requireChatGPTUser("/conversations");return <ConversationHub/>;}
