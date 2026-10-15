import { and,eq,or } from "drizzle-orm";
import { conversations,conversationCalls } from "@/db/schema";
import { guard,HttpError } from "@/lib/server";
import { roomRole,effectiveCallStatus } from "@/lib/conversation-policy";
export async function roomAccess(id:string,request?:Request,write=false){
  const {user,db}=await guard(request,true);if(!id||id.length>100)throw new HttpError(400,"Choose a conversation.");
  const [room]=await db.select().from(conversations).where(eq(conversations.id,id));
  const role=room?roomRole(room,user):null;if(!room||!role)throw new HttpError(404,"Conversation not found or you have not been invited.");
  if(write&&room.archivedAt)throw new HttpError(409,"This conversation is archived.");return {room,role,user,db};
}
export async function expireCalls(roomId:string){const {db}=await guard(undefined,true);const rows=await db.select().from(conversationCalls).where(and(eq(conversationCalls.roomId,roomId),or(eq(conversationCalls.status,"ringing"),eq(conversationCalls.status,"active"))));for(const row of rows){const status=effectiveCallStatus(row);if(status!==row.status)await db.update(conversationCalls).set({status:"ended",endReason:status,endedAt:new Date().toISOString()}).where(and(eq(conversationCalls.id,row.id),eq(conversationCalls.status,row.status)));}}
