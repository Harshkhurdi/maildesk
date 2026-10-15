import { and, eq, desc, count } from "drizzle-orm";
import { accounts, tasks, files, mail } from "@/db/schema";
import { guard, json, failure, ready, config } from "@/lib/server";
export async function GET(){try{
  const {user,db}=await guard();
  const [a,t,f,m,tc]=await Promise.all([
    db.select({id:accounts.id,email:accounts.email,phase:accounts.phase,scanned:accounts.scanned,total:accounts.total,syncedAt:accounts.syncedAt,error:accounts.error}).from(accounts).where(eq(accounts.ownerId,user.userId)),
    db.select().from(tasks).where(eq(tasks.ownerId,user.userId)).orderBy(desc(tasks.updatedAt)).limit(2000),
    db.select().from(files).where(eq(files.ownerId,user.userId)).orderBy(desc(files.updatedAt)).limit(500),
    db.select({n:count()}).from(mail).where(eq(mail.ownerId,user.userId)),
    db.select({n:count()}).from(tasks).where(eq(tasks.ownerId,user.userId)),
  ]);
  return json({accounts:a,tasks:t.map(({ownerId,...r})=>r),files:f.map(({ownerId,...r})=>r),mailCount:m[0].n,taskCount:tc[0].n,configured:ready(),callbackUrl:`${config().origin ?? ""}/api/gmail/callback`,userName:user.displayName});
}catch(e){return failure(e);}}
