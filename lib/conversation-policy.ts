export function normalizedEmail(email:string){return email.trim().toLowerCase();}
export function roomRole(room:{ownerId:string;participantEmail:string;archivedAt:string|null},user:{userId:string;email:string}):"owner"|"participant"|null {
  if(room.ownerId===user.userId)return "owner";
  return !room.archivedAt&&normalizedEmail(room.participantEmail)===normalizedEmail(user.email)?"participant":null;
}
export function effectiveCallStatus(call:{status:string;createdAt:string;callerSeenAt:number;calleeSeenAt:number},time=Date.now()):string {
  if(call.status==="ringing"&&time-Date.parse(call.createdAt)>45000)return "missed";
  if(call.status==="active"&&(time-call.callerSeenAt>45000||time-call.calleeSeenAt>45000))return "disconnected";
  return call.status;
}
export function callRole(call:{callerId:string;callerClientId:string;calleeId:string|null;calleeClientId:string|null},userId:string,clientId:string):"caller"|"callee"|null {
  if(call.callerId===userId&&call.callerClientId===clientId)return "caller";
  if(call.calleeId===userId&&call.calleeClientId===clientId)return "callee";
  return null;
}
