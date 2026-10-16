import { getRouteChatGPTUser } from "@/lib/route-session";
import { getDb } from "@/db";
import { parseJsonObject } from "@/lib/request-json";
import { SessionUnavailableError } from "@/lib/session-reader";
import {MAX_REQUEST_CHARACTERS,MAX_REQUEST_BYTES} from "@/lib/request-limits";
export function config() {
  const e=process.env;
  return { clientId:e.GOOGLE_CLIENT_ID,clientSecret:e.GOOGLE_CLIENT_SECRET,key:e.TOKEN_ENCRYPTION_KEY,origin:e.APP_ORIGIN||(e.VERCEL_PROJECT_PRODUCTION_URL?`https://${e.VERCEL_PROJECT_PRODUCTION_URL}`:undefined),ownerEmail:e.WORKSPACE_OWNER_EMAIL,turnKey:e.CF_TURN_KEY_ID,turnToken:e.CF_TURN_API_TOKEN };
}
export function ready() { const c=config();return !!(c.clientId&&c.clientSecret&&c.key&&c.origin); }
export class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export function isWorkspaceOwner(user:{userId:string;email:string}){const owner=config().ownerEmail;return owner?user.email.trim().toLowerCase()===owner.trim().toLowerCase():process.env.NODE_ENV==="development"&&process.env.MAILDESK_DEV_AUTH==="true"&&user.userId==="local_seedy";}
export async function guard(request?:Request,shared=false) {
  const user=await getRouteChatGPTUser(request);if(!user)throw new HttpError(401,"Sign in to your private workspace.");
  if(!shared&&!isWorkspaceOwner(user))throw new HttpError(403,"Your access is limited to your invited conversations. The personal workspace is private.");
  if(request && !["GET","HEAD"].includes(request.method)){
    const origin=request.headers.get("origin");
    const expected=config().origin || new URL(request.url).origin;
    if(!origin || origin!==expected)throw new HttpError(403,"This request must come from your workspace.");
    if(Number(request.headers.get("content-length") ?? 0)>MAX_REQUEST_BYTES)throw new HttpError(413,"This request is too large. Reduce its content or attachments and try again.");
  }
  return { user,db:getDb() };
}
export async function body(request:Request) {const text=await request.text();if(text.length>MAX_REQUEST_CHARACTERS)throw new HttpError(413,"This request is too large. Reduce its content or attachments and try again.");try{return parseJsonObject(text);}catch{throw new HttpError(400,"Invalid request. Send a JSON object.");}}
export function failure(e:unknown){if(e instanceof SessionUnavailableError)return json({error:e.message},503);if(e instanceof HttpError)return json({error:e.message},e.status);console.error("Workspace request failed", e instanceof Error ? e.name : "error");return json({error:"The workspace could not finish this request. Your last saved data has been kept. Try again."},500);}
export function uid(){return crypto.randomUUID();}
export function now(){return new Date().toISOString();}
export function base64(bytes:Uint8Array){let s="";bytes.forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
export function unbase64(value:string){return Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));}
async function aesKey(){const k=config().key;if(!k)throw new HttpError(503,"Gmail setup is incomplete.");return crypto.subtle.importKey("raw",unbase64(k),"AES-GCM",false,["encrypt","decrypt"]);}
export async function encrypt(value:unknown){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(),new TextEncoder().encode(JSON.stringify(value)));return base64(iv)+"."+base64(new Uint8Array(data));}
export async function decrypt(value:string){const [iv,data]=value.split(".");const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:unbase64(iv)},await aesKey(),unbase64(data));return JSON.parse(new TextDecoder().decode(bytes));}
