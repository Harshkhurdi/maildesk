import {NextRequest,NextResponse} from "next/server";
import {auth} from "@/lib/auth-server";
export default async function proxy(request:NextRequest){return auth().middleware({loginUrl:"/auth/sign-in"})(request);}
export const config={matcher:["/","/conversations/:path*","/ai-studio/:path*","/code/:path*","/shopping/:path*","/web/:path*","/x/:path*"]};
