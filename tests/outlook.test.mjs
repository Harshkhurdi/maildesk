import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { GOOGLE_SCOPES, googleCapabilities, requestedGoogleScopes, safeProviderId, emailAddresses } from '../lib/outlook-policy.ts';
import { composeMime } from '../lib/outlook-mime.ts';
import { calendarEventInput, providerCalendarEvent } from '../lib/calendar-policy.ts';
import { calendarRange, eventOverlapsDay, localDateKey } from '../lib/calendar-view.ts';
import { isolated, HttpError, json, failure } from './suite-fixture.mjs';
const baseMail={to:'recipient@example.test',subject:'Fixture ✓',html:'<p>Test body</p>',attachments:[]};
test('Google consent defaults to read-only; mail and calendar powers must be requested explicitly',()=>{
  assert.equal(requestedGoogleScopes(undefined),GOOGLE_SCOPES.read);assert.equal(requestedGoogleScopes([]),GOOGLE_SCOPES.read);
  assert.deepEqual(googleCapabilities([GOOGLE_SCOPES.read]),{read:true,mail:false,calendar:false});
  assert.deepEqual(googleCapabilities([GOOGLE_SCOPES.mail,GOOGLE_SCOPES.calendar]),{read:true,mail:true,calendar:true});
  assert.equal(requestedGoogleScopes(['mail','calendar','mail']).split(' ').length,3);assert.throws(()=>requestedGoogleScopes(['full-access']));
});
test('MIME sends UTF-8, correct reply headers and binary attachments without header injection',()=>{
  const raw=Buffer.from(composeMime('owner@example.test',{...baseMail,cc:'cc@example.test',bcc:'bcc@example.test',inReplyTo:'<original@example.test>',references:'<original@example.test>',attachments:[{name:'résumé.pdf',type:'application/pdf',data:Buffer.from('%PDF-fixture').toString('base64')}]}),'base64url').toString();
  assert.match(raw,/To: recipient@example.test/);assert.match(raw,/Cc: cc@example.test/);assert.match(raw,/Bcc: bcc@example.test/);assert.match(raw,/In-Reply-To: <original@example.test>/);assert.match(raw,/References: <original@example.test>/);
  assert.match(raw,/multipart\/mixed/);assert(raw.includes(Buffer.from('Fixture ✓').toString('base64')));assert(raw.includes(Buffer.from('%PDF-fixture').toString('base64')));assert(raw.includes(encodeURIComponent('résumé.pdf')));
  for(const changed of [{subject:'ok\r\nBcc: stolen@example.test'},{to:'victim@example.test\nBcc: stolen@example.test'},{inReplyTo:'invalid'},{to:'Name <recipient@example.test>'}])assert.throws(()=>composeMime('owner@example.test',{...baseMail,...changed}));
});
test('drafts can be incomplete; sends require recipients and attachment limits are enforced',()=>{
  assert.doesNotThrow(()=>composeMime('owner@example.test',{...baseMail,to:''},true));assert.throws(()=>composeMime('owner@example.test',{...baseMail,to:''}));
  assert.throws(()=>composeMime('owner@example.test',{...baseMail,attachments:[{name:'large.bin',type:'application/octet-stream',data:Buffer.alloc(650001).toString('base64')}]}),/650 KB/);
  for(const id of ['../other','a/b','?x',''])assert.throws(()=>safeProviderId(id));assert.equal(safeProviderId('message-123'),'message-123');assert.throws(()=>emailAddresses('invalid'));
});
function gmailMessage(id='m1'){return {id,threadId:'thread1',labelIds:['INBOX','UNREAD'],internalDate:'1791964800000',snippet:'preview',payload:{mimeType:'multipart/mixed',headers:[{name:'Subject',value:'Hello'},{name:'From',value:'Person <person@example.test>'},{name:'To',value:'owner@example.test'},{name:'Message-ID',value:'<original@example.test>'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Full message').toString('base64url')}},{filename:'file.txt',mimeType:'text/plain',body:{attachmentId:'attachment1',size:4}}]}};}
async function routes({deny=false,permission=true,provider}={}){
  const calls=[],capabilityChecks=[],account={id:'owned',email:'owner@example.test'};
  const bindings={z,HttpError,json,failure,safeProviderId,composeMime,calendarEventInput,providerCalendarEvent,body:r=>r.json(),now:()=>new Date().toISOString(),accounts:{id:'id',ownerId:'ownerId'},eq:()=>true,and:()=>true,
    guard:async()=>{if(deny)throw new HttpError(401,'Sign in');return {user:{userId:'owner'},db:{update(){return {set(){return {where:async()=>{}};}};}}};},
    outlookAccount:async(id,owner,capability='read')=>{assert.equal(owner,'owner');if(id!=='owned')throw new HttpError(404,'Not found');capabilityChecks.push(capability);if(!permission&&capability!=='read')throw new HttpError(403,'Reconnect');return {row:account,api:async(service,path,init={})=>{calls.push({service,path,init});return provider?provider(service,path,init):path.startsWith('threads/')?{messages:[gmailMessage()]}:path==='labels'?{labels:[]}:path.startsWith('messages?')?{messages:[{id:'m1'}],nextPageToken:'page2'}:path.startsWith('messages/m1?')?gmailMessage():{id:'provider-result'};}};},
  };
  const normalizerBindings = { ...bindings }; delete normalizerBindings.outlookAccount;
  const normalizer=await isolated('../lib/outlook.ts',{...normalizerBindings,decodePart:value=>Buffer.from(value,'base64url').toString(),htmlToText:value=>value.replace(/<[^>]*>/g,'')});bindings.normalizeMessage=normalizer.normalizeMessage;
  return {calls,capabilityChecks,messages:await isolated('../app/api/outlook/messages/route.ts',bindings),calendar:await isolated('../app/api/outlook/calendar/route.ts',bindings),labels:await isolated('../app/api/outlook/labels/route.ts',bindings),attachments:await isolated('../app/api/outlook/attachments/route.ts',bindings),normalizeMessage:bindings.normalizeMessage};
}
const req=(path,method='GET',body)=>new Request('https://app.example.test'+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('live message pagination, folder search and full threads use official endpoints for the owned account',async()=>{
  const f=await routes();let response=await f.messages.GET(req('/messages?accountId=owned&folder=SENT&q=from%3Aperson%40example.test&pageToken=next'));assert.equal(response.status,200);let result=await response.json();assert.equal(result.nextPageToken,'page2');assert.equal(result.messages[0].subject,'Hello');assert.match(f.calls[0].path,/labelIds=SENT/);assert.match(f.calls[0].path,/pageToken=next/);assert.match(f.calls[0].path,/q=from/);
  response=await f.messages.GET(req('/messages?accountId=owned&threadId=thread1'));result=await response.json();assert.equal(result.messages[0].text,'Full message');assert.equal(result.messages[0].attachments[0].id,'attachment1');
  assert.equal((await f.messages.GET(req('/messages?accountId=foreign'))).status,404);
});
test('sending, draft updates, reply threading and attachment payloads use modify capability; saved drafts are consumed',async()=>{
  const f=await routes();const response=await f.messages.POST(req('/messages','POST',{accountId:'owned',action:'send',draftId:'draft1',threadId:'thread1',inReplyTo:'<original@example.test>',...baseMail}));assert.equal(response.status,200);assert.deepEqual(f.capabilityChecks,['mail']);assert.equal(f.calls[0].path,'drafts/draft1');assert.equal(f.calls[0].init.method,'PUT');assert.equal(JSON.parse(f.calls[0].init.body).message.threadId,'thread1');assert.equal(f.calls[1].path,'drafts/send');assert.deepEqual(JSON.parse(f.calls[1].init.body),{id:'draft1'});
  const draft=await routes();assert.equal((await draft.messages.POST(req('/messages','POST',{accountId:'owned',action:'draft',...baseMail,to:''}))).status,200);assert.equal(draft.calls[0].path,'drafts');
});
test('denied write scopes and invalid payloads never send, mutate mail or modify calendars',async()=>{
  const f=await routes({permission:false});assert.equal((await f.messages.POST(req('/messages','POST',{accountId:'owned',action:'send',...baseMail}))).status,403);
  assert.equal((await f.messages.PATCH(req('/messages','PATCH',{accountId:'owned',id:'m1',add:['TRASH']}))).status,403);assert.equal(f.calls.length,0);
  const unauth=await routes({deny:true});for(const [handler,method,path,data] of [[unauth.messages,'POST','/messages',{accountId:'owned',action:'send',...baseMail}],[unauth.messages,'GET','/messages?accountId=owned'],[unauth.calendar,'DELETE','/calendar',{accountId:'owned',id:'event1',etag:'tag'}]])assert.equal((await handler[method](req(path,method,data))).status,401);assert.equal(unauth.calls.length,0);
});
test('trash uses recoverable provider trash and label actions never invoke permanent deletion',async()=>{
  const f=await routes();assert.equal((await f.messages.PATCH(req('/messages','PATCH',{accountId:'owned',id:'m1',add:['TRASH']}))).status,200);assert.equal(f.calls[0].path,'messages/m1/trash');
  await f.messages.PATCH(req('/messages','PATCH',{accountId:'owned',id:'m1',add:['Label_1'],remove:['INBOX']}));assert.deepEqual(JSON.parse(f.calls[1].init.body),{addLabelIds:['Label_1'],removeLabelIds:['INBOX']});assert(f.calls.every(c=>c.init.method!=='DELETE'));
});
test('attachment metadata is resolved from the owned message and oversized downloads are refused',async()=>{
  const f=await routes({provider:(_service,path)=>path.includes('/attachments/')?{data:Buffer.from('test').toString('base64url')}:gmailMessage()});const response=await f.attachments.GET(req('/attachments?accountId=owned&messageId=m1&index=0&name=evil.html'));assert.equal(response.status,200);assert.equal(await response.text(),'test');assert.match(response.headers.get('content-disposition'),/file.txt/);assert.equal(response.headers.get('content-type'),'application/octet-stream');
  const large=await routes({provider:()=>{const m=gmailMessage();m.payload.parts[1].body.size=3_000_001;return m;}});assert.equal((await large.attachments.GET(req('/attachments?accountId=owned&messageId=m1&index=0'))).status,413);assert.equal(large.calls.length,1);
});
const event={summary:'Project review',description:'Status',location:'Office',start:'2026-11-02T04:30:00Z',end:'2026-11-02T05:30:00Z',timeZone:'Asia/Kolkata',attendees:['guest@example.test'],reminderMinutes:15};
test('calendar events require real instants, a valid IANA timezone and end after start',()=>{
  assert(calendarEventInput.safeParse(event).success);for(const changed of [{timeZone:'Invalid/Zone'},{end:event.start},{start:'2026-11-02T10:00'},{attendees:['not-an-email']}])assert(!calendarEventInput.safeParse({...event,...changed}).success);
  const value=providerCalendarEvent(event);assert.equal(value.start.timeZone,'Asia/Kolkata');assert.deepEqual(value.attendees,[{email:'guest@example.test'}]);assert.deepEqual(value.reminders.overrides,[{method:'popup',minutes:15}]);
});
test('calendar create, conditional update and delete request attendee notifications and reject invalid ranges',async()=>{
  const f=await routes();assert.equal((await f.calendar.POST(req('/calendar','POST',{accountId:'owned',event}))).status,200);assert.equal(f.calls[0].path,'events?sendUpdates=all');assert.equal(f.calls[0].init.method,'POST');
  assert.equal((await f.calendar.PATCH(req('/calendar','PATCH',{accountId:'owned',id:'event1',etag:'"revision1"',event}))).status,200);assert.equal(f.calls[1].init.headers['If-Match'],'"revision1"');
  assert.equal((await f.calendar.DELETE(req('/calendar','DELETE',{accountId:'owned',id:'event1',etag:'"revision1"'}))).status,200);assert.equal(f.calls[2].init.method,'DELETE');
  const count=f.calls.length;assert.equal((await f.calendar.GET(req('/calendar?accountId=owned&start=2026-01-01&end=2027-01-01'))).status,400);assert.equal(f.calls.length,count);
});
test('calendar ranges and exclusive all-day endings are correct in day, week and month views',()=>{
  const anchor=new Date(2026,9,29,17,30);assert.equal(calendarRange(anchor,'day').days.length,1);assert.equal(calendarRange(anchor,'week').days.length,7);assert.equal(calendarRange(anchor,'month').days.length,42);assert.equal(calendarRange(anchor,'week').start.getDay(),0);
  const allDay={start:{date:'2026-10-29'},end:{date:'2026-10-30'}};assert(eventOverlapsDay(allDay,new Date(2026,9,29)));assert(!eventOverlapsDay(allDay,new Date(2026,9,30)));assert.equal(localDateKey(anchor),'2026-10-29');
});
test('provider account ownership is checked before token refresh and conditional request headers survive the API wrapper',async()=>{
  const accounts={id:'id',ownerId:'ownerId'}, rows=[{id:'owned',ownerId:'owner',token:'fixture-token'}];let refreshes=0,requests=0;
  const accountModule=await isolated('../lib/outlook.ts',{HttpError,accounts,googleCapabilities,decrypt:async()=>({scopes:[GOOGLE_SCOPES.mail,GOOGLE_SCOPES.calendar]}),accessToken:async()=>{refreshes++;return 'fixture-access';},eq:(field,value)=>row=>row[field]===value,and:(...conditions)=>row=>conditions.every(c=>c(row)),getDb:()=>({select:()=>({from:()=>({where:async condition=>rows.filter(condition)})})}),fetch:async(url,init)=>{requests++;assert.equal(init.headers.Authorization,'Bearer fixture-access');assert.equal(init.headers['if-match'],'"version"');assert.match(url,/^https:\/\/www.googleapis.com\/calendar\/v3\/calendars\/primary\//);return Response.json({id:'event1'});}});
  await assert.rejects(accountModule.outlookAccount('owned','other','calendar'),e=>e.status===404);assert.equal(refreshes,0);
  const account=await accountModule.outlookAccount('owned','owner','calendar');await account.api('calendar','events/event1',{method:'PATCH',headers:{'If-Match':'"version"'}});assert.equal(requests,1);
});

test('MIME folds long Unicode subjects, accepts CC-only recipients and bounds multibyte HTML',()=>{
  const raw=Buffer.from(composeMime('owner@example.test',{...baseMail,to:'',cc:'cc@example.test',subject:'🎯'.repeat(250)}),'base64url').toString();
  assert(raw.includes('Cc: cc@example.test'));const subject=raw.match(/Subject: ([\s\S]*?)\r\nMIME-Version:/)[1];assert(subject.split('\r\n').every(line=>line.length<=75));
  assert.throws(()=>composeMime('owner@example.test',{...baseMail,html:'界'.repeat(220000)}),/650 KB/);
});
