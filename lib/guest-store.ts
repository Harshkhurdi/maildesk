import {z} from "zod";
import {validateFileContent} from "./file-content";
import {validateUtility} from "./utility-schema";
import {safeUrl} from "./task-rules";
import type {Task,Workspace,WorkspaceFile} from "./types";

export const GUEST_STORAGE_KEY="maildesk.guest.v1";
const MAX_CHARACTERS=2_000_000;
type BrowserStorage=Pick<Storage,"getItem"|"setItem">;
const date=z.string().datetime();
const taskDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value).nullable();
const task=z.object({id:z.string().min(1).max(100),title:z.string().trim().min(1).max(200),status:z.enum(["review","pending","waiting","done","dismissed","snoozed"]),priority:z.enum(["low","normal","high"]),due:taskDate,category:z.enum(["general","personal","application","work"]),notes:z.string().max(10000),taskUrl:z.string().max(4096).nullable().refine(value=>!value||!!safeUrl(value)),snoozedUntil:taskDate,accountId:z.null(),threadId:z.null(),sourceId:z.null(),evidence:z.string().max(1000),reason:z.string().max(1000),sourceChanged:z.literal(0),createdAt:date,updatedAt:date});
const file=z.object({id:z.string().min(1).max(100),title:z.string().trim().min(1).max(200),kind:z.enum(["document","slides","sheet"]),content:z.string().max(1000000),taskId:z.string().nullable(),mailId:z.null(),revision:z.number().int().min(1),createdAt:date,updatedAt:date}).refine(value=>validateFileContent(value.kind,value.content)!==null);
const utility=z.object({id:z.string().min(1).max(100),kind:z.enum(["code","shopping","web"]),title:z.string().trim().min(1).max(120),content:z.string().max(900000),revision:z.number().int().min(1),updatedAt:date}).refine(value=>validateUtility(value.kind,value.content)!==null);
const schema=z.object({version:z.literal(1),tasks:z.array(task).max(500),files:z.array(file).max(100),utilities:z.array(utility).max(300)}).refine(value=>{
  const taskIds=new Set(value.tasks.map(t=>t.id));
  return taskIds.size===value.tasks.length&&new Set(value.files.map(f=>f.id)).size===value.files.length&&new Set(value.utilities.map(i=>i.id)).size===value.utilities.length&&value.files.every(f=>!f.taskId||taskIds.has(f.taskId))&&["code","shopping","web"].every(kind=>value.utilities.filter(i=>i.kind===kind).length<=100);
});
export type GuestData=z.infer<typeof schema>;
export function emptyGuestData():GuestData{return {version:1,tasks:[],files:[],utilities:[]};}
export function guestWorkspace(data:GuestData):Workspace{return {accounts:[],tasks:data.tasks,files:data.files,mailCount:0,configured:false,callbackUrl:"",userName:"Guest"};}
export function readGuestData(storage:BrowserStorage):GuestData{
  const raw=storage.getItem(GUEST_STORAGE_KEY);if(raw===null)return emptyGuestData();
  try{if(raw.length>MAX_CHARACTERS)throw Error();return schema.parse(JSON.parse(raw));}
  catch{throw Error("Your saved guest data could not be opened. It has been kept in this browser; download a backup before making changes.");}
}
export function writeGuestData(storage:BrowserStorage,data:GuestData):GuestData{
  const parsed=schema.safeParse(data);if(!parsed.success)throw Error("Check the guest task, file, or saved tool content.");
  const raw=JSON.stringify(parsed.data);if(raw.length>MAX_CHARACTERS)throw Error("Guest storage is full. Export your work before adding more.");
  try{storage.setItem(GUEST_STORAGE_KEY,raw);}catch{throw Error("Guest storage is full or blocked. Download your work before closing this tab.");}
  return parsed.data;
}
export function saveGuestTask(storage:BrowserStorage,value:Task):Workspace{
  const data=readGuestData(storage),parsed=task.safeParse(value);if(!parsed.success)throw Error("Check the task title, dates, and link.");data.tasks=[parsed.data,...data.tasks.filter(t=>t.id!==value.id)];return guestWorkspace(writeGuestData(storage,data));
}
export function saveGuestFile(storage:BrowserStorage,value:WorkspaceFile):{workspace:Workspace;file:WorkspaceFile}{
  const data=readGuestData(storage),existing=data.files.find(f=>f.id===value.id);
  if((existing&&existing.revision!==value.revision)||(!existing&&!value.id.startsWith("draft:")))throw Error("This guest file changed in another tab. Download your draft and reopen the saved version.");
  const saved={...value,id:existing?.id??crypto.randomUUID(),revision:(existing?.revision??0)+1,updatedAt:new Date().toISOString(),mailId:null};
  data.files=[saved,...data.files.filter(f=>f.id!==saved.id)];return {workspace:guestWorkspace(writeGuestData(storage,data)),file:saved};
}
export function removeGuestFile(storage:BrowserStorage,id:string):Workspace{
  const data=readGuestData(storage);data.files=data.files.filter(f=>f.id!==id);return guestWorkspace(writeGuestData(storage,data));
}
export function createGuestUtilityApi(storage:BrowserStorage){return async function(path:string,method="GET",payload?:unknown){
  const url=new URL(path,"https://guest.local");if(url.origin!=="https://guest.local"||url.pathname!=="/api/utilities")throw Error("Sign in to use this connected feature.");
  const data=readGuestData(storage);
  if(method==="GET"){const kind=url.searchParams.get("kind");if(!["code","shopping","web"].includes(kind??""))throw Error("Choose a workspace tool.");return {items:data.utilities.filter(i=>i.kind===kind).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};}
  const p=payload as {id?:string;revision?:number;kind?:string;title?:string;content?:string};
  if(!p||typeof p!=="object")throw Error("Check the saved item.");
  if(method==="DELETE"){if(typeof p.id!=="string"||!data.utilities.some(i=>i.id===p.id))throw Error("Item not found.");data.utilities=data.utilities.filter(i=>i.id!==p.id);writeGuestData(storage,data);return {deleted:true};}
  if(method!=="POST"||!["code","shopping","web"].includes(p.kind??"")||typeof p.title!=="string"||typeof p.content!=="string")throw Error("Check the name and content.");
  const content=validateUtility(p.kind!,p.content);if(content===null)throw Error("Check the project files, website link, or shopping details.");
  const existing=data.utilities.find(i=>i.id===p.id);
  if(p.id&&(!existing||existing.kind!==p.kind||existing.revision!==p.revision))throw Error("This guest item changed in another tab. Download your changes and reopen the saved version.");
  const item={id:existing?.id??crypto.randomUUID(),kind:p.kind as "code"|"shopping"|"web",title:p.title.trim(),content,revision:(existing?.revision??0)+1,updatedAt:new Date().toISOString()};
  data.utilities=[item,...data.utilities.filter(i=>i.id!==item.id)];writeGuestData(storage,data);return {item};
};}
export async function guestUtilityApi(path:string,method="GET",payload?:unknown){return createGuestUtilityApi(window.localStorage)(path,method,payload);}
