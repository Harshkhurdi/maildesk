import { and,eq,gt } from "drizzle-orm";
import { accounts,mail,tasks } from "@/db/schema";
import { getDb } from "@/db";
import { config,decrypt,now,unbase64,HttpError } from "@/lib/server";
import { safeUrl,suggestTask } from "@/lib/task-rules";
type AccountRow=typeof accounts.$inferSelect;
type GmailPart={mimeType?:string;filename?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:GmailPart[];headers?:{name:string;value:string}[]};
type GmailMessage={id:string;threadId:string;labelIds?:string[];internalDate:string;snippet?:string;payload?:GmailPart};
export class GmailError extends HttpError {}
async function googleJson(url:string,signal:AbortSignal,init:RequestInit={}){
  if(signal.aborted)throw new GmailError(503,"Google sync timed out. Your saved mail is unchanged; try again later.");
  let response:Response;
  try{response=await fetch(url,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});}
  catch{throw new GmailError(503,"Google could not finish this sync. Your saved mail is unchanged; try again later.");}
  if(!response.ok){if(response.status===401)throw new GmailError(401,"Google access expired. Reconnect this account.");if(response.status===429||response.status===403)throw new GmailError(429,"Google rate limit or mailbox policy blocked this sync. Your saved mail is unchanged; try again later.");throw new GmailError(502,"Google could not finish this sync. Your saved mail is unchanged; try again later.");}
  try{return await response.json() as unknown;}catch{throw new GmailError(502,"Google returned incomplete mail data. Your saved mail is unchanged; try again later.");}
}
export async function accessToken(account:AccountRow,signal?:AbortSignal){
  const secret=await decrypt(account.token),c=config();
  let response:Response;
  try{response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({client_id:c.clientId!,client_secret:c.clientSecret!,refresh_token:secret.refreshToken,grant_type:"refresh_token"}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});}
  catch{throw new GmailError(503,"Google could not be reached to renew access. Your connection and progress are saved; try again later.");}
  const token=await response.json().catch(()=>null) as {error?:string;access_token?:unknown}|null;
  if(!response.ok){
    if(response.status===429)throw new GmailError(429,"Google limited access renewal. Your connection and progress are saved; try again later.");
    if(response.status>=500)throw new GmailError(503,"Google could not renew access right now. Your connection and progress are saved; try again later.");
    if(token?.error==="invalid_grant")throw new GmailError(401,"Google access expired or was revoked. Reconnect this account.");
    if(token?.error==="invalid_client"||token?.error==="unauthorized_client")throw new GmailError(503,"Google connection settings need attention. Ask the workspace owner to check the OAuth client configuration.");
    throw new GmailError(502,"Google could not renew access. Your connection and progress are saved; try again later.");
  }
  if(typeof token?.access_token!=="string"||!token.access_token)throw new GmailError(502,"Google did not return an access token. Try again later.");return token.access_token;
}
export function decodePart(value:string){try{return new TextDecoder().decode(unbase64(value));}catch{return "";}}
export function htmlToText(html:string){return html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_match,href,label)=>{const link=safeUrl(href.replace(/&amp;/g,"&"));return label+(link?" ("+link+")":"");}).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"").replace(/<!--[\s\S]*?-->/g,"").replace(/<\/(?:td|th)\s*>/gi,"\t").replace(/<br\s*\/?\s*>|<\/?(?:p|div|li|tr|h[1-6]|section|article|header|footer|main|aside|blockquote|ul|ol|table|address|figure|figcaption)\b[^>]*>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(match,digits)=>{const point=digits[0].toLowerCase()==="x"?parseInt(digits.slice(1),16):Number(digits);return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):match;}).replace(/&amp;/g,"&").replace(/\n{3,}/g,"\n\n");}

function messageBody(part?:GmailPart):string {
  if(!part)return "";
  const plain:string[]=[],html:string[]=[];
  function walk(p:GmailPart){if(p.filename)return;if(p.body?.data){if(p.mimeType==="text/plain")plain.push(decodePart(p.body.data));else if(p.mimeType==="text/html")html.push(htmlToText(decodePart(p.body.data)));}p.parts?.forEach(walk);}
  walk(part);const text=(plain.length?plain:html).join("\n");return text.length>40000?text.slice(0,40000)+"\n[Email preview truncated. Open the original email for the full message.]":text;
}
function attachmentNames(part?:GmailPart):{name:string;size:number}[]{if(!part)return [];const out:{name:string;size:number}[]=[];function walk(p:GmailPart){if(p.filename)out.push({name:p.filename,size:p.body?.size??0});p.parts?.forEach(walk);}walk(part);return out;}
function providerError():never{throw new GmailError(502,"Google returned incomplete mail data. Your saved mail is unchanged; try again later.");}
function record(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function validId(value:unknown):value is string{return typeof value==="string"&&/^[A-Za-z0-9_-]+$/.test(value);}
function validatePart(value:unknown,depth=0):asserts value is GmailPart{
  if(!record(value)||depth>20)providerError();
  if(value.mimeType!==undefined&&typeof value.mimeType!=="string")providerError();
  if(value.filename!==undefined&&typeof value.filename!=="string")providerError();
  if(value.headers!==undefined&&(!Array.isArray(value.headers)||!value.headers.every(h=>record(h)&&typeof h.name==="string"&&typeof h.value==="string")))providerError();
  if(value.body!==undefined){
    if(!record(value.body))providerError();
    const body=value.body;
    if(body.data!==undefined&&(typeof body.data!=="string"||!/^[A-Za-z0-9_-]*={0,2}$/.test(body.data)||body.data.replace(/=+$/,"").length%4===1))providerError();
    if(body.attachmentId!==undefined&&typeof body.attachmentId!=="string")providerError();
    if(body.size!==undefined&&(typeof body.size!=="number"||!Number.isSafeInteger(body.size)||body.size<0))providerError();
    if(typeof body.size==="number"&&body.size>0&&!body.data&&!body.attachmentId&&!value.parts)providerError();
  }
  if(value.parts!==undefined){if(!Array.isArray(value.parts))providerError();for(const part of value.parts)validatePart(part,depth+1);}
  if(value.body===undefined&&value.parts===undefined)providerError();
}
function validateMessage(value:unknown,id:string):GmailMessage{
  if(!record(value)||value.id!==id||!validId(value.threadId)||typeof value.internalDate!=="string"||!/^\d+$/.test(value.internalDate))providerError();
  const date=Number(value.internalDate);if(!Number.isSafeInteger(date)||!Number.isFinite(new Date(date).getTime()))providerError();
  if(value.labelIds!==undefined&&(!Array.isArray(value.labelIds)||!value.labelIds.every(label=>typeof label==="string")))providerError();
  if(value.snippet!==undefined&&typeof value.snippet!=="string")providerError();
  validatePart(value.payload);return value as GmailMessage;
}
export async function syncBatch(account:AccountRow,leaseId:string){
  const db=getDb(),deadline=AbortSignal.timeout(90000),token=await accessToken(account,deadline),headers={Authorization:`Bearer ${token}`};
  const api=(path:string)=>googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,deadline,{headers});
  // One current Gmail page only: legacy scan phases, queues and pagination are ignored.
  const list=await api("messages?maxResults=25&includeSpamTrash=false");
  if(!record(list)||(list.messages!==undefined&&!Array.isArray(list.messages)))providerError();
  if(list.messages===undefined&&((list.resultSizeEstimate!==undefined&&list.resultSizeEstimate!==0)||list.nextPageToken!==undefined))providerError();
  const ids:string[]=[],listedThreads=new Map<string,string>();
  for(const entry of (list.messages??[]) as unknown[]){
    if(!record(entry)||!validId(entry.id)||(entry.threadId!==undefined&&!validId(entry.threadId)))providerError();
    if(!ids.includes(entry.id)){ids.push(entry.id);if(typeof entry.threadId==="string")listedThreads.set(entry.id,entry.threadId);}
    if(ids.length===25)break;
  }
  const fetched:GmailMessage[]=new Array(ids.length);let next=0;
  // Four workers bound provider concurrency; all data must arrive before any writes.
  const fetches=await Promise.allSettled(Array.from({length:Math.min(4,ids.length)},async()=>{
    while(next<ids.length){const index=next++,id=ids[index];if(deadline.aborted)throw new GmailError(503,"Google sync timed out. Your saved mail is unchanged; try again later.");const message=validateMessage(await api(`messages/${encodeURIComponent(id)}?format=full`),id);if(listedThreads.has(id)&&listedThreads.get(id)!==message.threadId)providerError();fetched[index]=message;}
  }));
  const failed=fetches.find(result=>result.status==="rejected");if(failed?.status==="rejected")throw failed.reason;
  const rows=fetched.map(m=>{
    const header=(name:string)=>m.payload?.headers?.find(h=>h.name.toLowerCase()===name)?.value??"";
    return {id:`${account.id}:${m.id}`,ownerId:account.ownerId,accountId:account.id,gmailId:m.id,threadId:m.threadId,subject:header("subject")||"(No subject)",sender:header("from"),recipients:header("to"),body:messageBody(m.payload),snippet:htmlToText(m.snippet??""),labels:JSON.stringify(m.labelIds??[]),receivedAt:new Date(Number(m.internalDate)).toISOString(),attachments:JSON.stringify(attachmentNames(m.payload))};
  });
  const grouped=new Map<string,typeof rows>();for(const row of rows){const thread=grouped.get(row.threadId)??[];thread.push(row);grouped.set(row.threadId,thread);}
  for(const thread of grouped.values())thread.sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt));
  await db.transaction(async tx=>{
    // Lock the same owned, active lease before touching either cache or tasks.
    const lease=()=>and(eq(accounts.id,account.id),eq(accounts.ownerId,account.ownerId),eq(accounts.leaseId,leaseId),gt(accounts.leaseUntil,Date.now()));
    const [locked]=await tx.select({id:accounts.id}).from(accounts).where(lease()).for("update");
    if(!locked)throw new HttpError(409,"Another sync replaced this sync or the account was disconnected. Refresh the account status.");
    const existing=await tx.select().from(tasks).where(and(eq(tasks.accountId,account.id),eq(tasks.ownerId,account.ownerId)));
    const timestamp=now(),currentIds=new Set(rows.map(row=>row.id));
    for(const task of existing){if(task.sourceId&&!currentIds.has(task.sourceId))await tx.update(tasks).set({sourceChanged:1,reason:"The source email is outside the latest 25 messages. Open Gmail to review this task.",updatedAt:timestamp}).where(and(eq(tasks.id,task.id),eq(tasks.ownerId,account.ownerId),eq(tasks.accountId,account.id)));}
    await tx.delete(mail).where(and(eq(mail.accountId,account.id),eq(mail.ownerId,account.ownerId)));
    for(const row of rows)await tx.insert(mail).values(row);
    for(const [threadId,thread] of grouped){
      const candidate=suggestTask(thread.map(m=>({...m,labels:JSON.parse(m.labels)}))),saved=existing.find(task=>task.threadId===threadId);
      if(candidate){
        if(saved){const changed=saved.sourceId!==candidate.sourceId||saved.reason!==candidate.reason;
          await tx.update(tasks).set({sourceChanged:changed?1:saved.sourceChanged,reason:candidate.reason,evidence:candidate.evidence,sourceId:candidate.sourceId,updatedAt:changed?timestamp:saved.updatedAt}).where(and(eq(tasks.id,saved.id),eq(tasks.ownerId,account.ownerId),eq(tasks.accountId,account.id)));
        }else await tx.insert(tasks).values({id:`gmail:${account.id}:${threadId}`,ownerId:account.ownerId,accountId:account.id,threadId,title:candidate.title,sourceId:candidate.sourceId,evidence:candidate.evidence,due:candidate.due,taskUrl:candidate.taskUrl,category:candidate.category,priority:candidate.priority,reason:candidate.reason,status:"review",createdAt:timestamp,updatedAt:timestamp});
      }else if(saved){const latest=thread.filter(m=>!JSON.parse(m.labels).includes("SENT")).at(-1);
        if(latest&&saved.sourceId!==latest.id&&saved.sourceId&&currentIds.has(saved.sourceId))await tx.update(tasks).set({sourceChanged:1,reason:"The latest message may change whether this task is pending. Review the source thread.",updatedAt:timestamp}).where(and(eq(tasks.id,saved.id),eq(tasks.ownerId,account.ownerId),eq(tasks.accountId,account.id)));
      }
    }
    const result=await tx.update(accounts).set({phase:"ready",pageToken:null,historyId:null,nextHistoryId:null,queue:"[]",scanned:rows.length,total:rows.length,syncedAt:timestamp,error:null,leaseUntil:Date.now()+60000,leaseId:null}).where(lease()).returning({id:accounts.id});
    if(!result.length)throw new HttpError(409,"Another sync replaced this sync. Refresh the account status.");
  });
  return {done:true,processed:rows.length};
}
