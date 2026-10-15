import { and,eq,inArray } from "drizzle-orm";
import { accounts,mail,tasks,files } from "@/db/schema";
import { guard,body,json,failure,HttpError,decrypt } from "@/lib/server";
export async function POST(request:Request){try{
  const {user,db}=await guard(request);const p=await body(request);if(typeof p.accountId!=="string")throw new HttpError(400,"Select an account.");
  const [a]=await db.select().from(accounts).where(and(eq(accounts.id,p.accountId),eq(accounts.ownerId,user.userId)));if(!a)throw new HttpError(404,"Account not found.");if(a.leaseUntil>Date.now())throw new HttpError(409,"Stop the scan and wait for the current batch to finish before disconnecting.");
  let revoked=false;try{const token=await decrypt(a.token);const r=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",body:new URLSearchParams({token:token.refreshToken}),signal:AbortSignal.timeout(15000)});revoked=r.ok;}catch{}
  await db.transaction(async tx=>{
await Promise.all([
    tx.update(files).set({taskId:null}).where(and(eq(files.ownerId,user.userId),inArray(files.taskId,db.select({id:tasks.id}).from(tasks).where(eq(tasks.accountId,a.id))))),
    tx.update(files).set({mailId:null}).where(and(eq(files.ownerId,user.userId),inArray(files.mailId,db.select({id:mail.id}).from(mail).where(eq(mail.accountId,a.id))))),
    tx.delete(tasks).where(and(eq(tasks.ownerId,user.userId),eq(tasks.accountId,a.id))),
    tx.delete(mail).where(and(eq(mail.ownerId,user.userId),eq(mail.accountId,a.id))),
    tx.delete(accounts).where(and(eq(accounts.ownerId,user.userId),eq(accounts.id,a.id))),
  ]);});return json({disconnected:true,revoked,message:revoked?"Account disconnected and Google access revoked.":"Local account data was removed. Google revocation could not be confirmed; remove Maildesk access in your Google Account settings."});
}catch(e){return failure(e);}}
