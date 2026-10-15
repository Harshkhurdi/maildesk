import { and,count,eq,lt } from "drizzle-orm";
import { accounts,oauthStates } from "@/db/schema";
import { guard,body,json,failure,ready,config,base64,uid,HttpError } from "@/lib/server";
export async function POST(request:Request){try{
  const {user,db}=await guard(request);if(!ready())throw new HttpError(503,"Google connection setup is not finished. Open Settings for the required configuration.");
  const p=await body(request);let reconnect:typeof accounts.$inferSelect|undefined;
  if(p.accountId!==undefined){if(typeof p.accountId!=="string"||!p.accountId||p.accountId.length>100)throw new HttpError(400,"Choose an account to reconnect.");[reconnect]=await db.select().from(accounts).where(and(eq(accounts.id,p.accountId),eq(accounts.ownerId,user.userId)));if(!reconnect)throw new HttpError(404,"Account not found.");}
  const [n]=await db.select({n:count()}).from(accounts).where(eq(accounts.ownerId,user.userId));if(n.n>=10&&!reconnect)throw new HttpError(400,"All ten account slots are in use. Reconnect an existing account or disconnect one to add another.");
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt,Date.now()));
  const state=reconnect?`gmail-reconnect:${reconnect.id}:${uid()}`:uid(),verifier=base64(crypto.getRandomValues(new Uint8Array(32)));const challenge=base64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
  await db.insert(oauthStates).values({id:state,ownerId:user.userId,verifier,expiresAt:Date.now()+600000});
  const c=config(),u=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({client_id:c.clientId!,redirect_uri:`${c.origin}/api/gmail/callback`,response_type:"code",scope:"https://www.googleapis.com/auth/gmail.readonly",access_type:"offline",prompt:"consent select_account",state,code_challenge:challenge,code_challenge_method:"S256"}).forEach(([k,v])=>u.searchParams.set(k,v));
  if(reconnect)u.searchParams.set("login_hint",reconnect.email);
  const response=json({url:u.href});response.headers.set("Set-Cookie",`maildesk_oauth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail/callback; Max-Age=600`);return response;
}catch(e){return failure(e);}}
