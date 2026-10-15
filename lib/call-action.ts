import type { ConversationCall } from "./conversation-types";

type CallRequest = (path:string,method?:string,body?:unknown)=>Promise<any>;
export type CallActionOptions = {
  request:CallRequest;
  roomId:string;
  userId:string;
  clientId:string;
  action:"start"|"accept";
  kind:"audio"|"video";
  callId?:string;
  previousCallId?:string;
};

function matchesRecoveredCall(call:ConversationCall|undefined,options:CallActionOptions) {
  if(!call||typeof call.id!=="string"||!call.id||call.roomId!==options.roomId||call.kind!==options.kind)return false;
  if(options.action==="accept")return call.id===options.callId&&call.status==="active"&&call.calleeId===options.userId&&call.calleeClientId===options.clientId;
  return call.id!==options.previousCallId&&["ringing","active"].includes(call.status)&&call.callerId===options.userId&&call.callerClientId===options.clientId;
}

/** A lost response may follow a committed action. Recover from one verified read;
 * never retry the mutation or infer success from local state. */
export async function requestCallAction(options:CallActionOptions):Promise<{call:ConversationCall}> {
  const {request,roomId,clientId,action,kind,callId}=options;
  try{return await request("/api/conversations/call","POST",{roomId,clientId,callId:action==="start"?undefined:callId,kind,action});}
  catch(error){
    try{
      const poll=await request(`/api/conversations/poll?${new URLSearchParams({room:roomId,client:clientId})}`);
      if(matchesRecoveredCall(poll.call,options))return {call:poll.call};
    }catch{/* Keep the original action error when the recovery read also fails. */}
    throw error;
  }
}
