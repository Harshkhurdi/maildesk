import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {isWorkspaceOwner} from "@/lib/server";
import UtilityShell from "@/components/utility-shell";
import CodeWorkspace from "@/components/code-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/code");if(!isWorkspaceOwner(user))redirect("/conversations");return <UtilityShell path="/code" title="A little space to build." subtitle="Write, save, and preview small projects in your private workspace."><CodeWorkspace/></UtilityShell>;}
