import {redirect} from "next/navigation";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {isWorkspaceOwner} from "@/lib/server";
import UtilityShell from "@/components/utility-shell";
import ShoppingWorkspace from "@/components/shopping-workspace";
export const dynamic="force-dynamic";
export default async function Page(){const user=await requireChatGPTUser("/shopping");if(!isWorkspaceOwner(user))redirect("/conversations");return <UtilityShell path="/shopping" title="Find it. Compare it." subtitle="Search your favourite stores and keep real prices together."><ShoppingWorkspace/></UtilityShell>;}
