import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {isWorkspaceOwner} from "@/lib/server";
import UtilityShell from "@/components/utility-shell";
import WebWorkspace from "@/components/web-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/web");if(!isWorkspaceOwner(user))redirect("/conversations");return <UtilityShell path="/web" title="A window to the web." subtitle="Google search, useful links, and your own little reading list."><WebWorkspace/></UtilityShell>;}
