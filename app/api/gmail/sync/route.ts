import { and,eq,lte } from "drizzle-orm";
import { accounts } from "@/db/schema";
import { guard,body,json,failure,ready,uid,HttpError } from "@/lib/server";
import { syncBatch,GmailError } from "@/lib/gmail";
export const maxDuration=120;
export async function POST(request:Request){try{
  const {user,db}=await guard(request);if(!ready())throw new HttpError(503,"Google connection setup is incomplete.");const p=await body(request);if(typeof p.accountId!=="string")throw new HttpError(400,"Select an account.");
  const leaseId=uid();const [account]=await db.update(accounts).set({leaseUntil:Date.now()+240000,leaseId}).where(and(eq(accounts.id,p.accountId),eq(accounts.ownerId,user.userId),lte(accounts.leaseUntil,Date.now()))).returning();
  if(!account){
    const [owned]=await db.select().from(accounts).where(and(eq(accounts.id,p.accountId),eq(accounts.ownerId,user.userId)));
    if(!owned)throw new HttpError(404,"This account is no longer available.");
    if(owned.leaseId)throw new HttpError(409,"This account is already syncing. Wait a moment and refresh.");
    throw new HttpError(429,"Wait one minute between sync attempts for this account.");
  }
  try{return json(await syncBatch(account,leaseId));}catch(e){await db.update(accounts).set({error:e instanceof HttpError?e.message:"Sync interrupted. Your saved mail is unchanged; try again later.",leaseUntil:Date.now()+60000,leaseId:null}).where(and(eq(accounts.id,account.id),eq(accounts.ownerId,user.userId),eq(accounts.leaseId,leaseId)));if(e instanceof GmailError)throw new HttpError(e.status===401?400:e.status,e.message);throw e;}
}catch(e){return failure(e);}}
