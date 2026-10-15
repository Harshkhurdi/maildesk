import {auth} from "@/lib/auth-server";
import {config,json} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{path:string[]}>}){return auth().handler().GET(request,context);}
export async function POST(request:Request,context:{params:Promise<{path:string[]}>}){const expected=config().origin||new URL(request.url).origin;if(request.headers.get("origin")!==expected)return json({error:"Sign in from Maildesk."},403);return auth().handler().POST(request,context);}
