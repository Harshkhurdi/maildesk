import { and,eq,desc } from "drizzle-orm";
import { accounts,mail } from "@/db/schema";
import { guard,json,failure } from "@/lib/server";
export async function GET(request:Request){try{
  const {user,db}=await guard();const q=new URL(request.url).searchParams;const page=Math.max(0,Math.min(100000,Math.floor(Number(q.get("page"))||0)));const account=q.get("account"),search=(q.get("q")??"").slice(0,200),id=q.get("id"),thread=q.get("thread");
  const owned=await db.select({id:accounts.id}).from(accounts).where(and(eq(accounts.ownerId,user.userId),account?eq(accounts.id,account):undefined)).limit(10);
  // Bound each account before applying searches or source lookups. Legacy
  // cache rows must not let searches reach beyond the recent-mail window.
  const windows=await Promise.all(owned.map(a=>db.select().from(mail).where(and(eq(mail.ownerId,user.userId),eq(mail.accountId,a.id))).orderBy(desc(mail.receivedAt),desc(mail.gmailId)).limit(25)));
  const term=search.toLowerCase();
  const rows=windows.flat().filter(m=>(!id||m.id===id)&&(!thread||m.threadId===thread)&&(!term||[m.subject,m.sender,m.body].some(value=>value.toLowerCase().includes(term)))).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)||b.gmailId.localeCompare(a.gmailId));
  return json({mail:rows.slice(page*50,(page+1)*50).map(({ownerId,...m})=>m),total:rows.length,page,hasMore:(page+1)*50<rows.length});
}catch(e){return failure(e);}}
