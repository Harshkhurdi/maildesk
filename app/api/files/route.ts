import { and,eq,sql } from "drizzle-orm";
import { z } from "zod";
import { files,tasks,mail } from "@/db/schema";
import { guard,json,failure,body,uid,now,HttpError } from "@/lib/server";
const schema=z.object({title:z.string().trim().min(1).max(200),kind:z.enum(["document","slides","sheet"]),content:z.string().max(1000000),taskId:z.string().nullable(),mailId:z.string().nullable()});
function validateContent(kind:string,content:string){
  let value;try{value=JSON.parse(content);}catch{throw new HttpError(400,"The file content is invalid.");}
  const rule=kind==="document"?z.object({html:z.string().max(500000)}):kind==="slides"?z.object({slides:z.array(z.object({title:z.string().max(500),body:z.string().max(20000),notes:z.string().max(10000),color:z.string().regex(/^#[a-fA-F0-9]{6}$/)})).min(1).max(100)}):z.object({cells:z.record(z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/),z.string().max(5000)).refine(x=>Object.keys(x).length<=5000),rows:z.number().int().min(1).max(500),cols:z.number().int().min(1).max(26)});
  const p=rule.safeParse(value);if(!p.success)throw new HttpError(400,"The file is too large or contains unsupported content.");return JSON.stringify(p.data);
}
async function save(request:Request,update:boolean){try{
  const {user,db}=await guard(request);const raw=await body(request);const parsed=schema.safeParse(raw);if(!parsed.success)throw new HttpError(400,"Check the file name and content.");const p=parsed.data;const content=validateContent(p.kind,p.content);
  if(p.taskId){const [t]=await db.select({id:tasks.id}).from(tasks).where(and(eq(tasks.id,p.taskId),eq(tasks.ownerId,user.userId)));if(!t)throw new HttpError(404,"Linked task not found.");}
  if(p.mailId){const [m]=await db.select({id:mail.id}).from(mail).where(and(eq(mail.id,p.mailId),eq(mail.ownerId,user.userId)));if(!m)throw new HttpError(404,"Linked email not found.");}
  const timestamp=now();
  if(update){if(typeof raw.id!=="string"||!Number.isInteger(raw.revision))throw new HttpError(400,"Missing file revision.");
    const [row]=await db.update(files).set({...p,content,updatedAt:timestamp,revision:sql`${files.revision}+1`}).where(and(eq(files.id,raw.id),eq(files.ownerId,user.userId),eq(files.revision,raw.revision))).returning();
    if(!row)throw new HttpError(409,"This file changed in another tab. Download your draft, close it, and reopen the saved version before editing again.");return json({file:row});
  }
  const [row]=await db.insert(files).values({...p,content,id:uid(),ownerId:user.userId,createdAt:timestamp,updatedAt:timestamp}).returning();return json({file:row},201);
}catch(e){return failure(e);}}
export function POST(request:Request){return save(request,false);}
export function PATCH(request:Request){return save(request,true);}
export async function DELETE(request:Request){try{const {user,db}=await guard(request);const p=await body(request);if(typeof p.id!=="string")throw new HttpError(400,"Select a file.");const result=await db.delete(files).where(and(eq(files.id,p.id),eq(files.ownerId,user.userId))).returning();if(!result.length)throw new HttpError(404,"File not found.");return json({deleted:true});}catch(e){return failure(e);}}
