import { and,eq,sql,count,inArray } from "drizzle-orm";
import { accounts,mail,tasks } from "@/db/schema";
import { getDb } from "@/db";
import { config,decrypt,now,unbase64,HttpError } from "@/lib/server";
import { safeUrl,suggestTask } from "@/lib/task-rules";
type AccountRow=typeof accounts.$inferSelect;
type GmailPart={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:GmailPart[];headers?:{name:string;value:string}[]};
type GmailMessage={id:string;threadId:string;labelIds?:string[];internalDate:string;snippet?:string;payload?:GmailPart};
export class GmailError extends HttpError {}
async function googleJson(url:string,init:RequestInit={}){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});
  if(!response.ok){if(response.status===401)throw new GmailError(401,"Google access expired. Reconnect this account.");if(response.status===429||response.status===403)throw new GmailError(429,"Google rate limit or mailbox policy blocked this scan. Your progress is saved; try again later.");if(response.status===404)throw new GmailError(404,"Gmail history or thread is no longer available.");throw new GmailError(502,"Google could not finish this scan. Your progress is saved; try again.");}
  return response.json() as Promise<any>;
}
export async function accessToken(account:AccountRow){
  const secret=await decrypt(account.token),c=config();
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:c.clientId!,client_secret:c.clientSecret!,refresh_token:secret.refreshToken,grant_type:"refresh_token"}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new GmailError(401,"Google access expired or was revoked. Reconnect this account.");const token=await response.json() as any;
  if(!token.access_token)throw new GmailError(502,"Google did not return an access token.");return token.access_token as string;
}
export function decodePart(value:string){try{return new TextDecoder().decode(unbase64(value));}catch{return "";}}
export function htmlToText(html:string){return html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_match,href,label)=>{const link=safeUrl(href.replace(/&amp;/g,"&"));return label+(link?" ("+link+")":"");}).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,"&").replace(/\n{3,}/g,"\n\n");}
function messageBody(part?:GmailPart):string {
  if(!part)return "";
  const plain:string[]=[],html:string[]=[];
  function walk(p:GmailPart){if(p.filename)return;if(p.body?.data){if(p.mimeType==="text/plain")plain.push(decodePart(p.body.data));else if(p.mimeType==="text/html")html.push(htmlToText(decodePart(p.body.data)));}p.parts?.forEach(walk);}
  walk(part);const text=(plain.length?plain:html).join("\n");return text.length>40000?text.slice(0,40000)+"\n[Email preview truncated. Open the original email for the full message.]":text;
}
function attachmentNames(part?:GmailPart):{name:string;size:number}[]{if(!part)return [];const out:{name:string;size:number}[]=[];function walk(p:GmailPart){if(p.filename)out.push({name:p.filename,size:p.body?.size??0});p.parts?.forEach(walk);}walk(part);return out;}
export async function syncBatch(account:AccountRow,leaseId:string){
  const db=getDb(),token=await accessToken(account),headers={Authorization:`Bearer ${token}`};
  const api=(path:string)=>googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers});
  let phase=account.phase,pageToken=account.pageToken,historyId=account.historyId,nextHistoryId=account.nextHistoryId;
  let queue:string[]=JSON.parse(account.queue),threadIds:string[]=[],total=account.total;
  if(phase==="full"){
    const p=new URLSearchParams({maxResults:"5",includeSpamTrash:"true"});if(pageToken)p.set("pageToken",pageToken);
    const list=await api(`threads?${p}`);threadIds=(list.threads??[]).map((t:{id:string})=>t.id);pageToken=list.nextPageToken??null;
  }else{
    if(!queue.length){
      const p=new URLSearchParams({maxResults:"5",startHistoryId:historyId??""});if(pageToken)p.set("pageToken",pageToken);
      let changes;
      try{changes=await api(`history?${p}`);}catch(e){
        if(e instanceof GmailError&&e.status===404){const profile=await api("profile");await db.update(accounts).set({phase:"full",pageToken:null,queue:"[]",historyId:String(profile.historyId),nextHistoryId:null,total:Number(profile.messagesTotal)||0,error:"Gmail history expired. A full rescan is needed; your existing tasks are kept.",leaseUntil:0,leaseId:null}).where(and(eq(accounts.id,account.id),eq(accounts.leaseId,leaseId)));return {done:false,rescan:true,processed:0};}throw e;
      }
      queue=[...new Set<string>((changes.history??[]).flatMap((h:any)=>[...(h.messages??[]),...(h.messagesAdded??[]).map((x:any)=>x.message),...(h.messagesDeleted??[]).map((x:any)=>x.message),...(h.labelsAdded??[]).map((x:any)=>x.message),...(h.labelsRemoved??[]).map((x:any)=>x.message)].map((m:any)=>m.threadId).filter(Boolean)))];
      pageToken=changes.nextPageToken??null;nextHistoryId=String(changes.historyId??historyId);
    }
    threadIds=queue.slice(0,5);queue=queue.slice(5);
  }
  let processed=0;
  for(const threadId of threadIds){
    let thread:{messages?:GmailMessage[]};
    try{thread=await api(`threads/${encodeURIComponent(threadId)}?format=full`);}catch(e){
      if(e instanceof GmailError&&e.status===404){await db.delete(mail).where(and(eq(mail.accountId,account.id),eq(mail.threadId,threadId)));await db.update(tasks).set({sourceChanged:1,reason:"The source thread was deleted in Gmail. Review this task.",updatedAt:now()}).where(and(eq(tasks.accountId,account.id),eq(tasks.threadId,threadId)));continue;}throw e;
    }
    const rows=(thread.messages??[]).map(m=>{
      const header=(name:string)=>m.payload?.headers?.find(h=>h.name.toLowerCase()===name)?.value??"";
      return {id:`${account.id}:${m.id}`,ownerId:account.ownerId,accountId:account.id,gmailId:m.id,threadId,subject:header("subject")||"(No subject)",sender:header("from"),recipients:header("to"),body:messageBody(m.payload),snippet:htmlToText(m.snippet??""),labels:JSON.stringify(m.labelIds??[]),receivedAt:new Date(Number(m.internalDate)||0).toISOString(),attachments:JSON.stringify(attachmentNames(m.payload))};
    });
    // Keep the prior cache until replacement messages have been persisted successfully.
    for(let n=0;n<rows.length;n+=10){const chunk=rows.slice(n,n+10);if(chunk.length)await db.transaction(async tx=>{for(const row of chunk)await tx.insert(mail).values(row).onConflictDoUpdate({target:mail.id,set:row});});}
    const existingRows=await db.select({id:mail.id}).from(mail).where(and(eq(mail.accountId,account.id),eq(mail.threadId,threadId)));
    const currentIds=new Set(rows.map(r=>r.id)),stale=existingRows.filter(r=>!currentIds.has(r.id)).map(r=>r.id);
    for(let n=0;n<stale.length;n+=50)await db.delete(mail).where(and(eq(mail.accountId,account.id),inArray(mail.id,stale.slice(n,n+50))));
    processed+=rows.length;
    const candidate=suggestTask(rows.map(m=>({...m,labels:JSON.parse(m.labels)})));
    const latest=rows.filter(m=>!JSON.parse(m.labels).includes("SENT")).at(-1);
    if(candidate){const timestamp=now();const id=`gmail:${account.id}:${threadId}`;
      await db.insert(tasks).values({id,ownerId:account.ownerId,accountId:account.id,threadId,title:candidate.title,sourceId:candidate.sourceId,evidence:candidate.evidence,due:candidate.due,taskUrl:candidate.taskUrl,category:candidate.category,priority:candidate.priority,reason:candidate.reason,status:"review",createdAt:timestamp,updatedAt:timestamp}).onConflictDoUpdate({target:[tasks.ownerId,tasks.accountId,tasks.threadId],set:{sourceChanged:sql`CASE WHEN ${tasks.sourceId} != ${candidate.sourceId} OR ${tasks.reason} != ${candidate.reason} THEN 1 ELSE ${tasks.sourceChanged} END`,reason:candidate.reason,evidence:candidate.evidence,sourceId:candidate.sourceId,updatedAt:sql`CASE WHEN ${tasks.sourceId} != ${candidate.sourceId} OR ${tasks.reason} != ${candidate.reason} THEN ${timestamp} ELSE ${tasks.updatedAt} END`}});
    }else if(latest){await db.update(tasks).set({sourceChanged:1,reason:"The latest message may change whether this task is pending. Review the source thread.",updatedAt:now()}).where(and(eq(tasks.accountId,account.id),eq(tasks.threadId,threadId),sql`${tasks.sourceId} != ${latest.id}`));}
  }
  let done=false;
  if(phase==="full"&&!pageToken){phase="catchup";}
  else if(phase!=="full"&&!pageToken&&!queue.length){phase="ready";historyId=nextHistoryId??historyId;nextHistoryId=null;done=true;}
  const [scanned]=await db.select({n:count()}).from(mail).where(eq(mail.accountId,account.id));
  if(done){const profile=await api("profile");total=Number(profile.messagesTotal)||total;}
  const result=await db.update(accounts).set({phase,pageToken,historyId,nextHistoryId,queue:JSON.stringify(queue),scanned:scanned.n,total,syncedAt:done?now():account.syncedAt,error:null,leaseUntil:0,leaseId:null}).where(and(eq(accounts.id,account.id),eq(accounts.leaseId,leaseId))).returning({id:accounts.id});
  if(!result.length)throw new HttpError(409,"Another scan replaced this scan. Refresh the account status.");return {done,processed};
}
