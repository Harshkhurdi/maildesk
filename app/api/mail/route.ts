import { and,eq,desc,ilike,or,count } from "drizzle-orm";
import { mail } from "@/db/schema";
import { guard,json,failure } from "@/lib/server";
export async function GET(request:Request){try{
  const {user,db}=await guard();const q=new URL(request.url).searchParams;const page=Math.max(0,Math.min(100000,Math.floor(Number(q.get("page"))||0)));const account=q.get("account"),search=(q.get("q")??"").slice(0,200),id=q.get("id"),thread=q.get("thread");
  const where=and(eq(mail.ownerId,user.userId),account?eq(mail.accountId,account):undefined,id?eq(mail.id,id):undefined,thread?eq(mail.threadId,thread):undefined,search?or(ilike(mail.subject,`%${search}%`),ilike(mail.sender,`%${search}%`),ilike(mail.body,`%${search}%`)):undefined);
  const [rows,total]=await Promise.all([db.select().from(mail).where(where).orderBy(desc(mail.receivedAt)).limit(50).offset(page*50),db.select({n:count()}).from(mail).where(where)]);
  return json({mail:rows.map(({ownerId,...m})=>m),total:total[0].n,page,hasMore:(page+1)*50<total[0].n});
}catch(e){return failure(e);}}
