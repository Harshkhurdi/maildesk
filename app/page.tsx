import { redirect } from "next/navigation";
import { requireChatGPTUser } from "./chatgpt-auth";
import { isWorkspaceOwner } from "@/lib/server";
import Maildesk from "@/components/maildesk-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/");if(!isWorkspaceOwner(user))redirect("/access-denied");return <Maildesk/>;}
