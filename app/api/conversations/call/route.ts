import { and,eq,or,lt,sql } from "drizzle-orm";
import { z } from "zod";
import { conversationCalls,conversationSignals,conversations } from "@/db/schema";
import { body,json,failure,HttpError,uid,now } from "@/lib/server";
import { roomAccess,expireCalls } from "@/lib/conversation-server";
import { callRole,effectiveCallStatus } from "@/lib/conversation-policy";
const schema=z.object({roomId:z.string().min(1).max(100),clientId:z.string().uuid(),action:z.enum(["start","accept","decline","hangup","heartbeat","signal"]),callId:z.string().uuid().optional(),kind:z.enum(["audio","video"]).optional(),nonce:z.string().uuid().optional(),signal:z.discriminatedUnion("type",[
z.object({type:z.literal("description"),description:z.object({type:z.enum(["offer","answer"]),sdp:z.string().min(1).max(80000)})}),
z.object({type:z.literal("ice"),candidate:z.object({candidate:z.string().max(4096),sdpMid:z.string().max(100).nullable().optional(),sdpMLineIndex:z.number().int().min(0).max(100).nullable().optional(),usernameFragment:z.string().max(256).nullable().optional()})}),
z.object({type:z.literal("media"),audio:z.boolean(),video:z.boolean()})]).optional()});
export async function POST(request:Request){try{const parsed=schema.safeParse(await body(request));if(!parsed.success)throw new HttpError(400,"Invalid call request.");const p=parsed.data;const {room,user,db}=await roomAccess(p.roomId,request,true);const timestamp=now();await expireCalls(room.id);
if(p.action==="start"){
if(!p.kind)throw new HttpError(400,"Choose voice or video.");
const id=uid();const [call]=await db.insert(conversationCalls).values({id,roomId:room.id,callerId:user.userId,callerClientId:p.clientId,callerName:user.displayName,kind:p.kind,status:"ringing",callerSeenAt:Date.now(),calleeSeenAt:0,createdAt:timestamp}).onConflictDoNothing().returning();if(!call)throw new HttpError(409,"There is already a call in this conversation.");return json({call},201);
}
if(!p.callId)throw new HttpError(400,"Choose a call.");const [call]=await db.select().from(conversationCalls).where(and(eq(conversationCalls.id,p.callId),eq(conversationCalls.roomId,room.id)));if(!call)throw new HttpError(404,"Call not found.");const role=callRole(call,user.userId,p.clientId);
if(p.action==="accept"){
if(call.callerId===user.userId)throw new HttpError(403,"The other participant must accept this call.");const [updated]=await db.update(conversationCalls).set({status:"active",calleeId:user.userId,calleeClientId:p.clientId,calleeSeenAt:Date.now(),acceptedAt:timestamp}).where(and(eq(conversationCalls.id,call.id),eq(conversationCalls.status,"ringing"))).returning();if(!updated)throw new HttpError(409,"This call was already answered, ended, or expired.");return json({call:updated});
}
if(p.action==="decline"){
if(call.callerId===user.userId)throw new HttpError(403,"Only the other participant can decline this call.");const [updated]=await db.update(conversationCalls).set({status:"ended",endReason:"declined",endedAt:timestamp}).where(and(eq(conversationCalls.id,call.id),eq(conversationCalls.status,"ringing"))).returning();if(!updated)throw new HttpError(409,"This call is no longer ringing.");return json({call:updated});
}
if(!role)throw new HttpError(403,"This call is active on another device, or you are not a participant.");
if(p.action==="hangup"){const [updated]=await db.update(conversationCalls).set({status:"ended",endReason:"ended",endedAt:timestamp}).where(eq(conversationCalls.id,call.id)).returning();return json({call:updated});}
if(p.action==="heartbeat"){if(!["ringing","active"].includes(call.status))return json({ended:true});await db.update(conversationCalls).set(role==="caller"?{callerSeenAt:Date.now()}:{calleeSeenAt:Date.now()}).where(eq(conversationCalls.id,call.id));return json({alive:true});}
if(call.status!=="active"||!p.signal||!p.nonce)throw new HttpError(409,"The call is not ready for connection signals.");if(p.signal.type==="description"&&((p.signal.description.type==="offer"&&role!=="caller")||(p.signal.description.type==="answer"&&role!=="callee")))throw new HttpError(403,"Invalid call negotiation role.");const to=role==="caller"?call.calleeClientId:call.callerClientId;if(!to)throw new HttpError(409,"The other participant has not joined yet.");await db.insert(conversationSignals).values({roomId:room.id,callId:call.id,fromClientId:p.clientId,toClientId:to,nonce:p.nonce,payload:JSON.stringify(p.signal),createdAt:Date.now()}).onConflictDoNothing();await db.delete(conversationSignals).where(and(eq(conversationSignals.roomId,room.id),lt(conversationSignals.createdAt,Date.now()-600000)));return json({sent:true});
}catch(e){return failure(e);}}

export async function GET(request:Request){try{const {room,db}=await roomAccess(new URL(request.url).searchParams.get("room")??"");const rows=await db.select().from(conversationCalls).where(eq(conversationCalls.roomId,room.id)).orderBy(sql`${conversationCalls.createdAt} DESC`).limit(50);return json({calls:rows.map(c=>({...c,status:effectiveCallStatus(c)}))});}catch(e){return failure(e);}}
