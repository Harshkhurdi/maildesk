import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {isWorkspaceOwner} from "@/lib/server";
import UtilityShell from "@/components/utility-shell";
import XWorkspace from "@/components/x-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/x");if(!isWorkspaceOwner(user))redirect("/conversations");return <UtilityShell path="/x" title="Stay in the conversation." subtitle="Your X account, with posts close to the rest of your day."><XWorkspace/></UtilityShell>;}
