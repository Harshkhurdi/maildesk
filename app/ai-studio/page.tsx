import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/server";
import AIStudio from "@/components/ai-studio/workspace";
import "./studio.css";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/ai-studio");if(!isWorkspaceOwner(user))redirect("/conversations");return <AIStudio/>;}
