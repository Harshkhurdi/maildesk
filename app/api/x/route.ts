import {and,eq} from "drizzle-orm";
import {xConnections} from "@/db/schema";
import {guard,json,failure,HttpError,body,decrypt,encrypt,now,config} from "@/lib/server";
import {xReady,xToken} from "@/lib/x-server";
export async function GET(){try{const {user,db}=await guard();const [c]=await db.select().from(xConnections).where(eq(xConnections.ownerId,user.userId));return json({configured:xReady(),callbackUrl:`${config().origin}/api/x/callback`,connection:c?{username:c.username,name:c.name,feed:JSON.parse(c.feed),fetchedAt:c.fetchedAt}:null});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const {user,db}=await guard(request);
  if(!xReady())throw new HttpError(503,"X API access has not been configured.");
  const p=await body(request);if(!["home","own"].includes(p.view))throw new HttpError(400,"Choose a timeline.");
  // Commit refreshed credentials and the retry checkpoint before requesting the
  // timeline. X may rotate the refresh token even if its timeline later fails.
  const prepared=await db.transaction(async tx=>{
    const [c]=await tx.select().from(xConnections).where(eq(xConnections.ownerId,user.userId)).for("update");
    if(!c)throw new HttpError(400,"Connect X first.");
    if(Date.now()-Math.max(c.fetchedAt,Number(JSON.parse(c.feed).lastAttemptAt)||0)<60000)throw new HttpError(429,"Wait a minute between timeline refreshes.");
    await tx.update(xConnections).set({feed:JSON.stringify({...JSON.parse(c.feed),lastAttemptAt:Date.now()})}).where(eq(xConnections.ownerId,user.userId));
    try{
      let token=await decrypt(c.token),savedToken=c.token;
      if(token.expiresAt<Date.now()+60000){
        if(!token.refresh_token)throw new HttpError(401,"Reconnect X to continue.");
        token={...token,...await xToken({grant_type:"refresh_token",refresh_token:token.refresh_token})};
        savedToken=await encrypt(token);
        await tx.update(xConnections).set({token:savedToken,updatedAt:now()}).where(eq(xConnections.ownerId,user.userId));
      }
      return {accessToken:token.access_token as string,xId:c.xId,savedToken};
    }catch(e){return {error:e instanceof HttpError?e:new HttpError(503,"X is temporarily unavailable. Your saved timeline is unchanged; retry later.")};}
  });
  if("error" in prepared)throw prepared.error;
  const u=new URL(`https://api.x.com/2/users/${encodeURIComponent(prepared.xId)}/${p.view==="home"?"timelines/reverse_chronological":"tweets"}`);
  u.search=new URLSearchParams({max_results:"25","tweet.fields":"created_at,author_id","expansions":"author_id","user.fields":"name,username"}).toString();
  let response:Response;try{response=await fetch(u,{headers:{Authorization:`Bearer ${prepared.accessToken}`},signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(503,"X is temporarily unavailable. Your saved timeline is unchanged; retry later.");}
  if(!response.ok)throw new HttpError(response.status===429?429:response.status===401?401:502,response.status===429?"X rate limit reached. Retry later.":response.status===401?"Reconnect X to continue.":response.status===402||response.status===403?"Your X API plan cannot read this timeline. Check access and credits.":"X could not load this timeline. Your saved timeline is unchanged.");
  let data;try{data=await response.json();}catch{throw new HttpError(502,"X returned an unreadable timeline. Your saved timeline is unchanged.");}
  if(!data||typeof data!=="object"||Array.isArray(data)||(data.data!==undefined&&!Array.isArray(data.data))||(data.includes?.users!==undefined&&!Array.isArray(data.includes.users))||(data.data===undefined&&data.meta?.result_count!==0))throw new HttpError(502,"X returned an incomplete timeline. Your saved timeline is unchanged.");
  const feed={view:p.view,posts:data.data??[],users:data.includes?.users??[]};
  const saved=await db.update(xConnections).set({feed:JSON.stringify(feed),fetchedAt:Date.now(),updatedAt:now()}).where(and(eq(xConnections.ownerId,user.userId),eq(xConnections.xId,prepared.xId),eq(xConnections.token,prepared.savedToken))).returning({xId:xConnections.xId});
  if(!saved.length)throw new HttpError(409,"Your X connection changed during the refresh. Refresh the page and try again.");
  return json({feed});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{const {user,db}=await guard(request);await db.delete(xConnections).where(eq(xConnections.ownerId,user.userId));return json({disconnected:true});}catch(e){return failure(e);}}
