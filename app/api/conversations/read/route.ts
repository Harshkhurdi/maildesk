import { and,eq,sql } from "drizzle-orm";
import { conversations,conversationMessages } from "@/db/schema";
import { body,json,failure,HttpError } from "@/lib/server";
import { roomAccess } from "@/lib/conversation-server";
export async function POST(request:Request){try{const p=await body(request);if(!p||typeof p.roomId!=="string"||!Number.isInteger(p.messageId)||p.messageId<1)throw new HttpError(400,"Choose a message.");const {room,role,db}=await roomAccess(p.roomId,request);const [m]=await db.select({id:conversationMessages.id}).from(conversationMessages).where(and(eq(conversationMessages.id,p.messageId),eq(conversationMessages.roomId,room.id)));if(!m)throw new HttpError(404,"Message not found.");await db.update(conversations).set(role==="owner"?{ownerReadId:sql`GREATEST(${conversations.ownerReadId},${m.id})`}:{participantReadId:sql`GREATEST(${conversations.participantReadId},${m.id})`}).where(eq(conversations.id,room.id));return json({read:true});}catch(e){return failure(e);}}
