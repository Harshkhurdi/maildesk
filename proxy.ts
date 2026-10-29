import {NextRequest} from "next/server";
import {auth} from "@/lib/auth-server";
export default async function proxy(request:NextRequest){return auth().middleware({loginUrl:"/auth/sign-in"})(request);}
export const config={matcher:["/","/ai-studio/:path*"]};
