import assert from 'node:assert/strict';
// Local mock identities only; this suite must never run against production.
const base='http://127.0.0.1:5173',uuid=()=>crypto.randomUUID();let checks=0;
async function api(profile,path,method='GET',body,expected=200){const res=await fetch(base+path,{method,headers:{cookie:`__sites_local_auth=${profile}`,origin:base,'content-type':'application/json'},body:body&&method!=="GET"?JSON.stringify(body):undefined});const data=await res.json();assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);checks++;return data;}
await api(0,'/api/conversations/rooms','GET',undefined,401);
for(const path of ['/api/workspace','/api/mail','/api/gmail/connect','/api/gmail/pdf','/api/tasks','/api/files'])await api(2,path,path==='/api/workspace'||path==='/api/mail'?'GET':'POST',{},403);
await api(2,'/api/conversations/rooms','POST',{title:'Blocked',participantName:'Other',participantEmail:'other@sites.test'},403);
const {room}=await api(1,'/api/conversations/rooms','POST',{title:'API permission test',participantName:'Mira',participantEmail:'guest@sites.test'},201);
const {room:privateRoom}=await api(1,'/api/conversations/rooms','POST',{title:'Other participant',participantName:'Other',participantEmail:'other@sites.test'},201);
assert(!(await api(2,'/api/conversations/rooms')).rooms.some(r=>r.id===privateRoom.id));checks++;
await api(2,`/api/conversations/messages?room=${privateRoom.id}`,'GET',undefined,404);
const payload={roomId:room.id,text:'Test message',nonce:uuid()};const first=await api(2,'/api/conversations/messages','POST',payload,201);const retry=await api(2,'/api/conversations/messages','POST',payload);assert.equal(first.message.id,retry.message.id);checks++;
await api(2,'/api/conversations/messages','POST',{...payload,text:'Changed'},409);
await api(2,'/api/conversations/messages','POST',{...payload,nonce:uuid(),fileId:'owner-file'},403);
await api(1,'/api/conversations/read','POST',{roomId:privateRoom.id,messageId:first.message.id},404);
await api(1,'/api/conversations/read','POST',{roomId:room.id,messageId:first.message.id});
const caller=uuid(),callee=uuid(),anotherDevice=uuid();const {call}=await api(1,'/api/conversations/call','POST',{roomId:room.id,clientId:caller,kind:'video',action:'start'},201);
await api(2,'/api/conversations/call','POST',{roomId:room.id,clientId:callee,kind:'audio',action:'start'},409);
await api(1,'/api/conversations/call','POST',{roomId:room.id,clientId:anotherDevice,callId:call.id,action:'accept'},403);
await api(2,'/api/conversations/call','POST',{roomId:room.id,clientId:callee,callId:call.id,action:'accept'});
await api(2,'/api/conversations/call','POST',{roomId:room.id,clientId:anotherDevice,callId:call.id,action:'hangup'},403);
await api(2,'/api/conversations/call','POST',{roomId:room.id,clientId:callee,callId:call.id,action:'signal',nonce:uuid(),signal:{type:'description',description:{type:'offer',sdp:'fake'}}},403);
const signal={roomId:room.id,clientId:caller,callId:call.id,action:'signal',nonce:uuid(),signal:{type:'media',audio:false,video:true}};
await api(1,'/api/conversations/call','POST',signal);await api(1,'/api/conversations/call','POST',signal);
assert.equal((await api(2,`/api/conversations/poll?room=${room.id}&client=${callee}`)).signals.length,1);checks++;
assert.equal((await api(2,`/api/conversations/poll?room=${room.id}&client=${anotherDevice}`)).signals.length,0);checks++;
await api(2,'/api/conversations/call','POST',{roomId:room.id,clientId:callee,callId:call.id,action:'hangup'});
await api(1,'/api/conversations/rooms','PATCH',{id:room.id,archived:true});await api(2,`/api/conversations/messages?room=${room.id}`,'GET',undefined,404);await api(1,'/api/conversations/messages','POST',{roomId:room.id,nonce:uuid(),text:'blocked'},409);await api(1,'/api/conversations/rooms','PATCH',{id:room.id,archived:false});await api(2,`/api/conversations/messages?room=${room.id}`);
// Keep permission-test rooms out of the normal local room list.
await api(1,'/api/conversations/rooms','PATCH',{id:room.id,archived:true});await api(1,'/api/conversations/rooms','PATCH',{id:privateRoom.id,archived:true});
for(const r of (await api(1,'/api/conversations/rooms')).rooms)if(['API permission test','Other participant'].includes(r.title))await api(1,'/api/conversations/rooms','PATCH',{id:r.id,archived:true});
console.log(`${checks} API permission, persistence, read-receipt and call-state checks passed.`);
