import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tasks, mail } from "@/db/schema";
import { guard,json,failure,body,uid,now,HttpError } from "@/lib/server";
import { safeUrl } from "@/lib/task-rules";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v).nullable();
const task=z.object({title:z.string().trim().min(1).max(200),status:z.enum(["review","pending","waiting","done","dismissed","snoozed"]),priority:z.enum(["normal","high","low"]),due:date,category:z.enum(["application","work","general","personal"]),notes:z.string().max(10000),taskUrl:z.string().max(4096).nullable(),snoozedUntil:date.optional(),sourceId:z.string().max(200).nullable().optional()});
export async function POST(request:Request){try{
  const {user,db}=await guard(request);const raw=await body(request);const parsed=task.safeParse(raw);if(!parsed.success)throw new HttpError(400,"Check the task title, dates, and status.");
  const p=parsed.data;if(p.status==="snoozed"&&!p.snoozedUntil)throw new HttpError(400,"Choose a snooze date.");if(p.taskUrl&&!safeUrl(p.taskUrl))throw new HttpError(400,"Use an http or https task link.");
  let source:typeof mail.$inferSelect|undefined;
  if(p.sourceId){[source]=await db.select().from(mail).where(and(eq(mail.id,p.sourceId),eq(mail.ownerId,user.userId)));if(!source)throw new HttpError(404,"Source email not found.");}
  const timestamp=now();const id=uid();
  if(source){const [existing]=await db.select().from(tasks).where(and(eq(tasks.ownerId,user.userId),eq(tasks.accountId,source.accountId),eq(tasks.threadId,source.threadId)));if(existing)return json({task:existing,existing:true});}
  const [row]=await db.insert(tasks).values({...p,taskUrl:safeUrl(p.taskUrl),snoozedUntil:p.snoozedUntil??null,id,ownerId:user.userId,accountId:source?.accountId??null,threadId:source?.threadId??null,sourceId:source?.id??null,evidence:source?.snippet??"",reason:source?"Created by you from an email.":"Created by you.",createdAt:timestamp,updatedAt:timestamp}).returning();return json({task:row},201);
}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{
  const {user,db}=await guard(request);const raw=await body(request);const parsed=task.omit({sourceId:true}).safeParse(raw);if(!parsed.success||typeof raw.id!=="string")throw new HttpError(400,"Check the task title, dates, and status.");
  const p=parsed.data;if(p.taskUrl&&!safeUrl(p.taskUrl))throw new HttpError(400,"Use an http or https task link.");
  if(p.status==="snoozed"&&!p.snoozedUntil)throw new HttpError(400,"Choose a snooze date.");
  const [row]=await db.update(tasks).set({...p,taskUrl:safeUrl(p.taskUrl),sourceChanged:0,updatedAt:now()}).where(and(eq(tasks.id,raw.id),eq(tasks.ownerId,user.userId))).returning();if(!row)throw new HttpError(404,"Task not found.");return json({task:row});
}catch(e){return failure(e);}}
