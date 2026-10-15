import { and,eq,sql,count } from "drizzle-orm";
import { accounts,oauthStates } from "@/db/schema";
import { guard,config,encrypt,uid,now,HttpError } from "@/lib/server";
export async function GET(request:Request){
  const c=config();const destination=`${c.origin ?? new URL(request.url).origin}/?view=accounts`;
  function done(error?:string){const r=Response.redirect(destination+(error?`&connection_error=${encodeURIComponent(error)}`:"&connected=1"),303);const h=new Headers(r.headers);h.set("Cache-Control","no-store");h.set("Set-Cookie","maildesk_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/gmail/callback; Max-Age=0");return new Response(null,{status:303,headers:h});}
  try{
    const {user,db}=await guard();const p=new URL(request.url).searchParams;const state=p.get("state"),code=p.get("code");const cookie=request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith("maildesk_oauth="))?.slice(15);
    if(!state||state!==cookie)throw new HttpError(400,"Connection expired. Please connect the account again.");
    const [s]=await db.delete(oauthStates).where(and(eq(oauthStates.id,state),eq(oauthStates.ownerId,user.userId))).returning();
    if(!s||s.expiresAt<Date.now())throw new HttpError(400,"Connection expired. Please connect the account again.");
    if(!code||p.get("error"))throw new HttpError(400,"Google connection was cancelled or denied.");
    const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({code,client_id:c.clientId!,client_secret:c.clientSecret!,redirect_uri:`${c.origin}/api/gmail/callback`,grant_type:"authorization_code",code_verifier:s.verifier}),signal:AbortSignal.timeout(20000)});
    const token=await r.json() as any;if(!r.ok||!token.refresh_token)throw new HttpError(400,"Google did not grant offline access. Reconnect and approve read-only Gmail access.");
    if(!String(token.scope??"").split(" ").includes("https://www.googleapis.com/auth/gmail.readonly"))throw new HttpError(400,"Read-only Gmail permission was not granted.");
    const profileResponse=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile",{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(20000)});if(!profileResponse.ok)throw new HttpError(400,"Could not read the Gmail account profile.");const profile=await profileResponse.json() as any;
    if(typeof profile.emailAddress!=="string"||!profile.historyId)throw new HttpError(400,"Google returned an incomplete account profile.");
    const encrypted=await encrypt({refreshToken:token.refresh_token});const email=profile.emailAddress.toLowerCase();const [existing]=await db.select().from(accounts).where(and(eq(accounts.ownerId,user.userId),eq(accounts.email,email)));
    if(existing)await db.update(accounts).set({token:encrypted,error:null}).where(eq(accounts.id,existing.id));
    else await db.transaction(async tx=>{await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${user.userId}))`);const [total]=await tx.select({n:count()}).from(accounts).where(eq(accounts.ownerId,user.userId));if(total.n>=10)throw new HttpError(400,"All ten account slots are in use.");await tx.insert(accounts).values({id:uid(),ownerId:user.userId,email,token:encrypted,historyId:String(profile.historyId),phase:"full",queue:"[]",scanned:0,total:Number(profile.messagesTotal)||0,leaseUntil:0,createdAt:now()});});
    return done();
  }catch(e){return done(e instanceof HttpError?e.message:"Google connection failed. Please retry from Settings.");}
}
