import { and,eq } from "drizzle-orm";
import { mail,accounts } from "@/db/schema";
import { guard,body,failure,HttpError,ready,unbase64 } from "@/lib/server";
import { accessToken } from "@/lib/gmail";
type Part={filename?:string;mimeType?:string;body?:{attachmentId?:string;data?:string;size?:number};parts?:Part[]};
const MAX=10*1024*1024;
export async function POST(request:Request){try{
  const {user,db}=await guard(request),p=await body(request);
  if(!p||typeof p.mailId!=="string"||!Number.isInteger(p.index)||p.index<0||p.index>500)throw new HttpError(400,"Choose a PDF attachment from an email.");
  const [m]=await db.select().from(mail).where(and(eq(mail.id,p.mailId),eq(mail.ownerId,user.userId)));
  if(!m)throw new HttpError(404,"This email is no longer available in your workspace.");
  const cached=JSON.parse(m.attachments)[p.index];if(!cached)throw new HttpError(404,"Attachment not found.");
  const [a]=await db.select().from(accounts).where(and(eq(accounts.id,m.accountId),eq(accounts.ownerId,user.userId)));
  if(!a||!ready())throw new HttpError(400,"Connect this Gmail account before opening its attachments.");
  const token=await accessToken(a),headers={Authorization:`Bearer ${token}`};
  async function google(path:string){const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers,signal:AbortSignal.timeout(30000)});if(r.status===401)throw new HttpError(400,"Google access expired. Reconnect this account.");if(r.status===404)throw new HttpError(404,"This attachment was removed from Gmail. Refresh your mailbox.");if(r.status===429||r.status===403)throw new HttpError(429,"Google could not allow this attachment request. Try again later or open the original email.");if(!r.ok)throw new HttpError(502,"Gmail could not load this attachment. Try again or open the original email.");return r.json() as Promise<any>;}
  const message=await google(`messages/${encodeURIComponent(m.gmailId)}?format=full`);
  const parts:Part[]=[];function walk(part:Part){if(part.filename)parts.push(part);part.parts?.forEach(walk);}if(message.payload)walk(message.payload);
  const part=parts[p.index];if(!part||part.filename!==cached.name)throw new HttpError(409,"The attachment list changed. Refresh your mailbox and open the email again.");
  if(part.mimeType!=="application/pdf"&&!/\.pdf$/i.test(part.filename??""))throw new HttpError(400,"This attachment is not a PDF.");
  if((part.body?.size??0)>MAX)throw new HttpError(413,"For PDF attachments larger than 10 MB, download the original from Gmail and open it with Choose a PDF.");
  const value=part.body?.attachmentId?await google(`messages/${encodeURIComponent(m.gmailId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`):part.body;
  if(!value?.data)throw new HttpError(404,"This PDF has no downloadable content.");
  if(value.data.length>Math.ceil(MAX*4/3)+16)throw new HttpError(413,"This attachment exceeds the 10 MB preview limit. Download it from Gmail and open it locally.");
  const bytes=unbase64(value.data);if(!new TextDecoder("latin1").decode(bytes.slice(0,1024)).includes("%PDF-"))throw new HttpError(400,"This attachment does not contain a readable PDF header.");
  return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":"inline; filename*=UTF-8''"+encodeURIComponent(part.filename??"attachment.pdf"),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'"}});
}catch(e){return failure(e);}}
