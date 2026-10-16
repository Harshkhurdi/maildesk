import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {safeUrl,suggestTask} from '../lib/task-rules.ts';

// Exercise the real handlers with in-memory dependencies. No accounts, provider
// requests, environment credentials, or persistent database are used.
async function isolatedModule(path,bindings){
  const source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const key='gmail_fixture_'+crypto.randomUUID().replaceAll('-','');
  globalThis[key]=bindings;
  try{return await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));}
  finally{delete globalThis[key];}
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const account={id:'f245a730-b120-4010-a5bf-5996549fbcaf',ownerId:'owner',email:'owner@gmail.test',token:'fixture-encrypted'};

async function tokenModule(fetcher){
  return isolatedModule('../lib/gmail.ts',{
    HttpError,fetch:fetcher,decrypt:async value=>{assert.equal(value,account.token);return {refreshToken:'fixture-refresh'};},
    config:()=>({clientId:'fixture-client',clientSecret:'fixture-secret'}),
  });
}
test('Google access renewal uses the saved refresh token and returns only a string access token',async()=>{
  const gmail=await tokenModule(async(url,init)=>{
    assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(init.method,'POST');
    assert.equal(init.body.get('grant_type'),'refresh_token');assert.equal(init.body.get('refresh_token'),'fixture-refresh');
    return Response.json({access_token:'fixture-access'});
  });
  assert.equal(await gmail.accessToken(account),'fixture-access');
});
test('revoked Google grants require reconnection',async()=>{
  const gmail=await tokenModule(async()=>Response.json({error:'invalid_grant'},{status:400}));
  await assert.rejects(gmail.accessToken(account),error=>error.status===401&&/Reconnect/.test(error.message));
});
test('Google outages and throttles preserve connection and offer a retry',async()=>{
  for(const status of [429,500,503]){
    const gmail=await tokenModule(async()=>Response.json({error:'temporarily_unavailable'},{status}));
    await assert.rejects(gmail.accessToken(account),error=>error.status===(status===429?429:503)&&/saved; try again later/.test(error.message)&&!/Reconnect|revoked/.test(error.message));
  }
});
test('Google network timeouts preserve connection instead of claiming revocation',async()=>{
  const gmail=await tokenModule(async()=>{throw new DOMException('fixture timeout','TimeoutError');});
  await assert.rejects(gmail.accessToken(account),error=>error.status===503&&/saved; try again later/.test(error.message));
});
test('invalid Google OAuth client settings identify configuration repair',async()=>{
  for(const providerError of ['invalid_client','unauthorized_client']){
    const gmail=await tokenModule(async()=>Response.json({error:providerError},{status:401}));
    await assert.rejects(gmail.accessToken(account),error=>error.status===503&&/configuration/.test(error.message)&&!/Reconnect/.test(error.message));
  }
});
test('unrecognized refresh failures and malformed provider responses stay retryable',async()=>{
  for(const response of [Response.json({error:'unexpected'},{status:400}),new Response('not json',{status:502}),Response.json({access_token:12}),Response.json({access_token:''})]){
    const gmail=await tokenModule(async()=>response);
    await assert.rejects(gmail.accessToken(account),error=>[502,503].includes(error.status)&&!/Reconnect|revoked/.test(error.message));
  }
});

function connectionDb(rows){
  const accounts={id:'id',ownerId:'ownerId'},oauthStates={expiresAt:'expiresAt'},saved=[];
  const eq=(field,value)=>row=>row[field]===value,and=(...conditions)=>row=>conditions.every(condition=>condition(row));
  const db={
    select(projection){return {from(table){assert.equal(table,accounts);return {async where(condition){const selected=rows.filter(condition);return projection?[{n:selected.length}]:selected;}};}};},
    delete(table){assert.equal(table,oauthStates);return {async where(){}};},
    insert(table){assert.equal(table,oauthStates);return {async values(value){saved.push(value);}};},
  };
  return {db,accounts,oauthStates,saved,eq,and,count:()=>true,lt:()=>true};
}
async function connectModule(rows){
  const fixture=connectionDb(rows);
  const handler=await isolatedModule('../app/api/gmail/connect/route.ts',{
    ...fixture,HttpError,guard:async()=>({user:{userId:'owner'},db:fixture.db}),body:request=>request.json(),ready:()=>true,
    config:()=>({clientId:'fixture-client',origin:'https://maildesk.test'}),uid:()=>crypto.randomUUID(),
    base64:bytes=>Buffer.from(bytes).toString('base64url'),json:data=>Response.json(data),failure:error=>Response.json({error:error.message},{status:error.status??500}),
  });
  return {...fixture,handler};
}
const request=body=>new Request('https://maildesk.test/api/gmail/connect',{method:'POST',body:JSON.stringify(body)});
const tenAccounts=()=>Array.from({length:10},(_,index)=>({...account,id:index?crypto.randomUUID():account.id,email:index?`account${index}@gmail.test`:account.email}));
test('Gmail reconnect at ten accounts is bound to an owned account and hints its email',async()=>{
  const {handler,saved}=await connectModule(tenAccounts());const response=await handler.POST(request({accountId:account.id}));
  assert.equal(response.status,200);const {url}=await response.json(),oauth=new URL(url);
  assert.equal(oauth.searchParams.get('login_hint'),account.email);
  assert.match(saved[0].id,new RegExp(`^gmail-reconnect:${account.id}:`));
  assert.equal(saved[0].ownerId,'owner');assert.equal(oauth.searchParams.get('state'),saved[0].id);
  assert.equal(oauth.searchParams.get('code_challenge_method'),'S256');
  assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('adding an eleventh Gmail account fails without creating OAuth state',async()=>{
  const {handler,saved}=await connectModule(tenAccounts());const response=await handler.POST(request({}));
  assert.equal(response.status,400);assert.equal(saved.length,0);
});
test('another owner account cannot be used to bypass the ten-account limit',async()=>{
  const foreign={...account,id:crypto.randomUUID(),ownerId:'other'};
  const {handler,saved}=await connectModule([...tenAccounts(),foreign]);
  assert.equal((await handler.POST(request({accountId:foreign.id}))).status,404);assert.equal(saved.length,0);
});
test('missing and malformed reconnect targets never create OAuth state',async()=>{
  for(const accountId of [crypto.randomUUID(),null,12,'']){
    const {handler,saved}=await connectModule([account]);
    assert.equal((await handler.POST(request({accountId}))).status,typeof accountId==='string'&&accountId?404:400);assert.equal(saved.length,0);
  }
});
test('normal Gmail connection remains available below capacity',async()=>{
  const {handler,saved}=await connectModule([account]);const response=await handler.POST(request({}));
  assert.equal(response.status,200);assert.equal(saved.length,1);assert(!saved[0].id.startsWith('gmail-reconnect:'));
  assert.equal(new URL((await response.json()).url).searchParams.has('login_hint'),false);
});

async function callbackModule({profileEmail=account.email,stateOwner='owner',targetOwner='owner',rawState,storedState,newAccount=false}={}){
  const state=rawState??(newAccount?crypto.randomUUID():`gmail-reconnect:${account.id}:${crypto.randomUUID()}`);
  const savedState={id:storedState??state,ownerId:stateOwner,verifier:'fixture-verifier',expiresAt:Date.now()+600000};
  const storedAccount={...account,ownerId:targetOwner,phase:'full',leaseId:'active-sync',leaseUntil:Date.now()+240000,scanned:12,historyId:'old-history'};
  const accounts={id:'id',ownerId:'ownerId',email:'email'},oauthStates={id:'id',ownerId:'ownerId'};
  const eq=(field,value)=>row=>row[field]===value,and=(...conditions)=>row=>conditions.every(condition=>condition(row));
  let exchanges=0,encrypted=0,updates=0,inserted;
  const sql=()=>true;
  const db={
    delete(table){assert.equal(table,oauthStates);return {where(condition){return {async returning(){return condition(savedState)?[savedState]:[];}};}};},
    select(projection){return {from(table){assert.equal(table,accounts);return {async where(condition){return projection?[{n:0}]:!newAccount&&condition(storedAccount)?[storedAccount]:[];}};}};},
    execute:async()=>{},
    insert(){return {async values(value){inserted=value;}};},
    transaction:async callback=>callback(db),
    update(table){assert.equal(table,accounts);return {set(values){return {async where(condition){if(condition(storedAccount)){updates++;Object.assign(storedAccount,values);}}};}};},
  };
  const handler=await isolatedModule('../app/api/gmail/callback/route.ts',{
    accounts,oauthStates,eq,and,sql,count:()=>true,now:()=>new Date().toISOString(),uid:()=>crypto.randomUUID(),HttpError,guard:async()=>({user:{userId:'owner'},db}),
    config:()=>({clientId:'fixture-client',clientSecret:'fixture-secret',origin:'https://maildesk.test'}),
    encrypt:async()=>{encrypted++;return 'replacement-encrypted-token';},
    fetch:async url=>{if(url==='https://oauth2.googleapis.com/token'){exchanges++;return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',scope:'https://www.googleapis.com/auth/gmail.readonly'});}assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/profile');return Response.json({emailAddress:profileEmail,messagesTotal:20000});},
  });
  const run=()=>handler.GET(new Request(`https://maildesk.test/api/gmail/callback?${new URLSearchParams({state,code:'fixture-code'})}`,{headers:{cookie:`maildesk_oauth=${state}`}}));
  return {run,storedAccount,inserted:()=>inserted,counts:()=>({exchanges,encrypted,updates})};
}
test('Gmail reconnect callback updates only the persisted owned target',async()=>{
  const fixture=await callbackModule({profileEmail:account.email.toUpperCase()});const response=await fixture.run();
  assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location')).searchParams.get('connected'),'1');
  assert.equal(fixture.storedAccount.token,'replacement-encrypted-token');assert.equal(fixture.storedAccount.phase,'recent');assert.equal(fixture.storedAccount.leaseId,'active-sync');assert(fixture.storedAccount.leaseUntil>Date.now());assert.equal(fixture.storedAccount.scanned,12);assert.equal(fixture.storedAccount.historyId,'old-history');assert.deepEqual(fixture.counts(),{exchanges:1,encrypted:1,updates:1});
});
test('new account callback starts in recent mode with zero cached count and no history checkpoint',async()=>{
  const fixture=await callbackModule({newAccount:true});const response=await fixture.run();assert.equal(new URL(response.headers.get('location')).searchParams.get('connected'),'1');const inserted=fixture.inserted();assert.equal(inserted.phase,'recent');assert.equal(inserted.scanned,0);assert.equal(inserted.total,0);assert.equal(inserted.historyId,null);assert.equal(inserted.queue,'[]');assert.equal(inserted.leaseUntil,0);
});
test('choosing a different Google account during reconnect preserves original credentials',async()=>{
  const fixture=await callbackModule({profileEmail:'different@gmail.test'});const response=await fixture.run();
  assert.match(new URL(response.headers.get('location')).searchParams.get('connection_error'),/Choose owner@gmail.test/);
  assert.equal(fixture.storedAccount.token,account.token);assert.deepEqual(fixture.counts(),{exchanges:1,encrypted:0,updates:0});
});
test('reconnect callback refuses foreign OAuth state or foreign account ownership before exchanging codes',async()=>{
  for(const options of [{stateOwner:'other'},{targetOwner:'other'}]){
    const fixture=await callbackModule(options);const response=await fixture.run();
    assert(new URL(response.headers.get('location')).searchParams.has('connection_error'));
    assert.equal(fixture.storedAccount.token,account.token);assert.deepEqual(fixture.counts(),{exchanges:0,encrypted:0,updates:0});
  }
});
test('unpersisted reconnect target changes in the callback query are rejected',async()=>{
  const rawState=`gmail-reconnect:${crypto.randomUUID()}:${crypto.randomUUID()}`;
  const fixture=await callbackModule({rawState,storedState:`gmail-reconnect:${account.id}:${crypto.randomUUID()}`});
  const response=await fixture.run();assert(new URL(response.headers.get('location')).searchParams.has('connection_error'));
  assert.deepEqual(fixture.counts(),{exchanges:0,encrypted:0,updates:0});
});

function cachedMessage(threadId){return {id:`${account.id}:message-${threadId}`,ownerId:account.ownerId,accountId:account.id,threadId,gmailId:`message-${threadId}`,subject:'Update',sender:'person@gmail.test',recipients:account.email,body:'Status update.',snippet:'Status update.',labels:'["INBOX"]',attachments:'[]',receivedAt:'2026-10-14T08:00:00.000Z'};}
function gmailMessage(id,options={}){return {id,threadId:`thread-${id}`,labelIds:['INBOX'],internalDate:'1791964800000',payload:{mimeType:'text/plain',body:{data:Buffer.from('Status update.').toString('base64url')},headers:[{name:'subject',value:'Update'}]},...options};}
const simpleProvider=ids=>async path=>path.startsWith('messages?')?Response.json({messages:ids.map(id=>({id}))}):Response.json(gmailMessage(decodeURIComponent(path.match(/^messages\/([^?]+)/)[1])));
async function syncFixture({initial={},cached=[],tasks:initialTasks=[],provider=simpleProvider([]),failInsert=false,failFinal=false,beforeLock,signalApi=AbortSignal,files:initialFiles=[]}={}){
  const accounts={id:'id',ownerId:'ownerId',leaseId:'leaseId',leaseUntil:'leaseUntil'},mail={id:'id',ownerId:'ownerId',accountId:'accountId',threadId:'threadId'},tasks={id:'id',ownerId:'ownerId',accountId:'accountId',threadId:'threadId',sourceId:'sourceId'},files={id:'id'};
  const state={...account,phase:'ready',pageToken:null,historyId:'old-history',nextHistoryId:null,queue:'[]',total:cached.length,scanned:cached.length,syncedAt:null,error:null,leaseId:'lease',leaseUntil:Date.now()+240000,...initial};
  const tables=new Map([[accounts,[state]],[mail,cached.map(value=>typeof value==='string'?cachedMessage(value):{...value})],[tasks,structuredClone(initialTasks)],[files,structuredClone(initialFiles)]]),requests=[],writes=[],locks=[];
  const eq=(field,value)=>row=>row[field]===value,gt=(field,value)=>row=>row[field]>value,and=(...conditions)=>row=>conditions.filter(Boolean).every(condition=>condition(row));
  let inTransaction=false,locked=false;
  function write(table){assert(inTransaction,'Every sync mutation must be transactional');assert(locked,'Account lease must be locked before any mutations');writes.push(table);}
  function query(table,projection){let condition=()=>true;const chain={where(value){condition=value;return chain;},for(value){assert.equal(table,accounts);assert.equal(value,'update');locks.push(value);beforeLock?.(state);locked=true;return chain;},then(resolve,reject){return Promise.resolve().then(()=>tables.get(table).filter(condition).map(row=>projection?Object.fromEntries(Object.entries(projection).map(([key,field])=>[key,row[field]])):{...row})).then(resolve,reject);}};return chain;}
  const db={
    select(projection){return {from:table=>query(table,projection)};},
    update(table){return {set(values){return {where(condition){let applied=false,result;function apply(){if(applied)return result;write(table);applied=true;if(table===accounts&&failFinal)return [];result=tables.get(table).filter(condition);for(const row of result)Object.assign(row,values);return result;}return {returning:async()=>apply().map(row=>({id:row.id})),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};}};}};},
    delete(table){return {async where(condition){write(table);tables.set(table,tables.get(table).filter(row=>!condition(row)));}};},
    insert(table){return {async values(value){write(table);if(failInsert&&table===mail)throw Error('fixture insert failure');tables.get(table).push({...value});}};},
    async transaction(callback){const snapshot=new Map([...tables].map(([table,rows])=>[table,structuredClone(rows)]));inTransaction=true;try{return await callback(db);}catch(error){for(const [table,rows] of snapshot){if(table===accounts){Object.keys(state).forEach(key=>delete state[key]);Object.assign(state,rows[0]);tables.set(table,[state]);}else tables.set(table,rows);}throw error;}finally{inTransaction=false;locked=false;}},
  };
  const gmail=await isolatedModule('../lib/gmail.ts',{
    accounts,mail,tasks,eq,gt,and,AbortSignal:signalApi,getDb:()=>db,HttpError,config:()=>({clientId:'fixture',clientSecret:'fixture'}),decrypt:async()=>({refreshToken:'fixture'}),now:()=>new Date().toISOString(),
    unbase64:value=>new Uint8Array(Buffer.from(value,'base64url')),safeUrl,suggestTask,
    fetch:async(url,init)=>{assert(init.signal instanceof AbortSignal);if(String(url).endsWith('/token'))return Response.json({access_token:'fixture'});const path=String(url).split('/users/me/')[1];requests.push(path);return provider(path,init);},
  });
  return {state,requests,writes,locks,mail:()=>tables.get(mail),tasks:()=>tables.get(tasks),files:()=>tables.get(files),run:()=>gmail.syncBatch({...state},'lease')};
}
test('sync selects one messages page, caps at 25 unique IDs and never follows legacy pagination/history/threads',async()=>{
  const ids=Array.from({length:30},(_,i)=>`id-${i}`),fixture=await syncFixture({initial:{phase:'rescan',pageToken:'legacy-page',queue:'not-json',nextHistoryId:'legacy-next'},cached:Array.from({length:40},(_,i)=>`old-${i}`),provider:async path=>{
    if(path.startsWith('messages?'))return Response.json({messages:[{id:ids[0]},...ids.map(id=>({id}))],nextPageToken:'ignored-next'});
    assert.match(path,/^messages\/id-\d+\?format=full$/);return Response.json(gmailMessage(path.match(/^messages\/([^?]+)/)[1]));
  }});
  const started=Date.now();assert.deepEqual(await fixture.run(),{done:true,processed:25});assert.equal(fixture.mail().length,25);
  assert.deepEqual(fixture.requests.slice(0,1),['messages?maxResults=25&includeSpamTrash=false']);assert.equal(fixture.requests.length,26);assert(!fixture.requests.some(path=>/history|profile|threads|pageToken/.test(path)));
  assert.equal(fixture.state.phase,'ready');for(const key of ['historyId','pageToken','nextHistoryId','leaseId'])assert.equal(fixture.state[key],null);assert.equal(fixture.state.queue,'[]');assert.equal(fixture.state.total,25);assert.equal(fixture.state.scanned,25);assert(fixture.state.leaseUntil>=started+60000);assert.equal(fixture.locks.length,1);
});
test('a genuinely empty Gmail list is a successful atomic empty-window refresh',async()=>{
  for(const value of [{},{messages:[]}]){const fixture=await syncFixture({cached:['old'],provider:async()=>Response.json(value)});assert.deepEqual(await fixture.run(),{done:true,processed:0});assert.equal(fixture.mail().length,0);assert.equal(fixture.state.phase,'ready');}
});
test('provider concurrency is bounded to four and sent mail remains in the selected window',async()=>{
  let active=0,peak=0;const ids=Array.from({length:25},(_,i)=>`id-${i}`),fixture=await syncFixture({provider:async path=>{
    if(path.startsWith('messages?'))return Response.json({messages:ids.map(id=>({id}))});active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,3));active--;return Response.json(gmailMessage(path.match(/^messages\/([^?]+)/)[1],{labelIds:['SENT']}));
  }});await fixture.run();assert.equal(peak,4);assert.equal(fixture.mail().length,25);assert(fixture.mail().every(row=>row.labels==='["SENT"]'));
});
test('token and provider requests share a 90-second budget with individual request limits',async()=>{
  const durations=[],signals=[];const signalApi={timeout:milliseconds=>{durations.push(milliseconds);const signal=new AbortController().signal;signals.push(signal);return signal;},any:values=>{assert(values.includes(signals[0]));return AbortSignal.any(values);}};
  const fixture=await syncFixture({provider:simpleProvider(['a']),signalApi});await fixture.run();assert.deepEqual(durations,[90000,20000,25000,25000]);
});
test('an exhausted shared provider deadline is retryable and preserves the old cache',async()=>{
  const controller=new AbortController();controller.abort();const signalApi={timeout:()=>controller.signal,any:AbortSignal.any.bind(AbortSignal)};
  const fixture=await syncFixture({cached:['old'],signalApi});await assert.rejects(fixture.run(),error=>error.status===503);assert.equal(fixture.mail().length,1);assert.equal(fixture.writes.length,0);
});
test('any message fetch failure retains the entire old cache and every legacy checkpoint',async()=>{
  const fixture=await syncFixture({initial:{phase:'full',pageToken:'old-page',queue:'["old-queue"]',nextHistoryId:'next'},cached:['old'],provider:async path=>path.startsWith('messages?')?Response.json({messages:[{id:'a'},{id:'b'}]}):path.startsWith('messages/b?')?Response.json({}, {status:503}):Response.json(gmailMessage('a'))});
  const previous={...fixture.state};await assert.rejects(fixture.run(),error=>error.status===502);assert.deepEqual(fixture.state,previous);assert.deepEqual(fixture.mail().map(row=>row.threadId),['old']);assert.equal(fixture.writes.length,0);
});
test('malformed lists, IDs, dates and bodies cannot silently erase cached mail',async()=>{
  const malformedLists=[null,[],{messages:null},{messages:{}},{messages:[{}]},{messages:[{id:''}]},{messages:[{id:12}]},{resultSizeEstimate:4},{nextPageToken:'impossible'}];
  for(const list of malformedLists){const fixture=await syncFixture({cached:['old'],provider:async()=>Response.json(list)});await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.mail().length,1);assert.equal(fixture.writes.length,0);}
  const malformedMessages=[{},gmailMessage('wrong'),gmailMessage('a',{threadId:''}),gmailMessage('a',{internalDate:'abc'}),gmailMessage('a',{internalDate:'99999999999999999'}),gmailMessage('a',{payload:undefined}),gmailMessage('a',{payload:{mimeType:'text/plain'}}),gmailMessage('a',{payload:{body:{size:20}}}),gmailMessage('a',{payload:{body:{data:12}}}),gmailMessage('a',{payload:{body:{data:'!!!'}}}),gmailMessage('a',{payload:{body:{data:'a'}}}),gmailMessage('a',{payload:{body:{},parts:{}}}),gmailMessage('a',{labelIds:[12]})];
  for(const message of malformedMessages){const fixture=await syncFixture({cached:['old'],provider:async path=>path.startsWith('messages?')?Response.json({messages:[{id:'a'}]}):Response.json(message)});await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.mail().length,1);assert.equal(fixture.writes.length,0);}
  const fixture=await syncFixture({cached:['old'],provider:async()=>new Response('broken-json')});await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.mail().length,1);
});
test('list and fetched message thread IDs must agree before replacement',async()=>{
  const fixture=await syncFixture({cached:['old'],provider:async path=>path.startsWith('messages?')?Response.json({messages:[{id:'a',threadId:'listed'}]}):Response.json(gmailMessage('a'))});await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.mail().length,1);
});
test('task sources outside the window remain stored and flagged, including a retained thread',async()=>{
  const saved=[{id:'outside',ownerId:'owner',accountId:account.id,threadId:'old-thread',sourceId:`${account.id}:old-source`,status:'pending',notes:'Keep notes',title:'My task',sourceChanged:0},{id:'same-thread',ownerId:'owner',accountId:account.id,threadId:'thread-a',sourceId:`${account.id}:other-source`,status:'done',notes:'Done notes',sourceChanged:0}];
  const fixture=await syncFixture({cached:['old'],tasks:saved,provider:simpleProvider(['a'])});await fixture.run();assert.equal(fixture.tasks().length,2);
  for(const task of fixture.tasks()){const original=saved.find(value=>value.id===task.id);assert.equal(task.sourceId,original.sourceId);assert.equal(task.status,original.status);assert.equal(task.notes,original.notes);assert.equal(task.sourceChanged,1);assert.match(task.reason,/outside the latest 25/);assert(!/deleted/.test(task.reason));}
});
test('refresh keeps generated files and their task/mail references when old messages leave the cache',async()=>{
  const files=[{id:'generated-file',ownerId:'owner',taskId:'saved-task',mailId:`${account.id}:message-old`,content:'Saved content',revision:2}],fixture=await syncFixture({cached:['old'],files,provider:simpleProvider(['a'])});await fixture.run();assert.deepEqual(fixture.files(),files);assert(!fixture.mail().some(row=>row.gmailId==='message-old'));
});
test('chronologically grouped thread messages update source evidence while preserving confirmed user metadata',async()=>{
  const saved={id:'saved',ownerId:'owner',accountId:account.id,threadId:'shared',sourceId:`${account.id}:old`,status:'done',notes:'My notes',title:'My custom title',priority:'low',category:'personal',due:'2027-01-01',taskUrl:'https://custom.test/',snoozedUntil:'2027-01-02',createdAt:'2026-01-01',sourceChanged:0,reason:'old reason'};
  const fixture=await syncFixture({tasks:[saved],provider:async path=>{
    if(path.startsWith('messages?'))return Response.json({messages:[{id:'reply'},{id:'request'}]});const id=path.match(/^messages\/([^?]+)/)[1];return Response.json(gmailMessage(id,{threadId:'shared',labelIds:id==='reply'?['SENT']:['INBOX'],internalDate:id==='reply'?'1791964900000':'1791964800000',payload:{mimeType:'text/plain',body:{data:Buffer.from(id==='reply'?'Submitted.':'Please submit your documents.').toString('base64url')},headers:[{name:'subject',value:'New action'}]}}));
  }});await fixture.run();assert.equal(fixture.tasks().length,1);const task=fixture.tasks()[0];for(const key of ['status','notes','title','priority','category','due','taskUrl','snoozedUntil','createdAt'])assert.equal(task[key],saved[key]);assert.equal(task.sourceId,`${account.id}:request`);assert.equal(task.sourceChanged,1);assert.match(task.evidence,/Please submit/);assert.match(task.reason,/You replied/);
});
test('cache insert failures and lost final leases roll the entire transaction back',async()=>{
  for(const options of [{failInsert:true},{failFinal:true}]){const task={id:'saved',ownerId:'owner',accountId:account.id,threadId:'old',sourceId:'outside',status:'pending',sourceChanged:0};const fixture=await syncFixture({...options,cached:['old'],tasks:[task],provider:simpleProvider(['a'])}),previous={...fixture.state};await assert.rejects(fixture.run());assert.deepEqual(fixture.mail().map(row=>row.threadId),['old']);assert.deepEqual(fixture.tasks(),[task]);assert.deepEqual(fixture.state,previous);}
});
test('expired, replaced, foreign or disconnected account leases prevent every cache/task write',async()=>{
  for(const beforeLock of [state=>{state.leaseUntil=Date.now()-1;},state=>{state.leaseId='replaced';},state=>{state.ownerId='foreign';},state=>{state.id='disconnected';}]){
    const fixture=await syncFixture({cached:['old'],provider:simpleProvider(['a']),beforeLock});await assert.rejects(fixture.run(),error=>error.status===409);assert.equal(fixture.writes.length,0);assert.equal(fixture.mail().length,1);
  }
});
test('sync replacement is scoped to its owner and account',async()=>{
  const foreign={...cachedMessage('foreign'),id:'foreign',accountId:'another-account',ownerId:'another-owner'},fixture=await syncFixture({cached:['old',foreign],provider:simpleProvider(['a'])});await fixture.run();assert.equal(fixture.mail().length,2);assert(fixture.mail().some(row=>row.id==='foreign'));
});

async function syncRouteFixture({owned=true,leaseId=null,leaseUntil=0,syncError,replaceOnFailure=false}={}){
  const accounts={id:'id',ownerId:'ownerId',leaseUntil:'leaseUntil',leaseId:'leaseId'},state={...account,ownerId:owned?'owner':'other',leaseId,leaseUntil,phase:'full',pageToken:'saved-page',historyId:'saved-history',queue:'["saved"]'};
  const eq=(field,value)=>row=>row[field]===value,lte=(field,value)=>row=>row[field]<=value,and=(...conditions)=>row=>conditions.every(condition=>condition(row));let calls=0;
  const db={update(){return {set(values){return {where(condition){let applied=false,result;const apply=()=>{if(applied)return result;applied=true;result=condition(state)?[state]:[];for(const row of result)Object.assign(row,values);return result;};return {returning:async()=>apply().map(row=>({...row})),then:(resolve,reject)=>Promise.resolve().then(apply).then(resolve,reject)};}};}};},select(){return {from(){return {async where(condition){return condition(state)?[{...state}]:[];}};}};}};
  const handler=await isolatedModule('../app/api/gmail/sync/route.ts',{accounts,eq,lte,and,HttpError,GmailError:HttpError,guard:async()=>({user:{userId:'owner'},db}),body:request=>request.json(),ready:()=>true,uid:()=> 'new-lease',json:value=>Response.json(value),failure:error=>Response.json({error:error.message},{status:error.status??500}),syncBatch:async()=>{calls++;if(replaceOnFailure)state.leaseId='replacement';if(syncError)throw syncError;return {done:true,processed:25};}});
  return {state,handler,calls:()=>calls,run:()=>handler.POST(new Request('https://maildesk.test/api/gmail/sync',{method:'POST',body:JSON.stringify({accountId:account.id})}))};
}
test('sync route distinguishes active scanning, cooldown and unowned accounts without provider work',async()=>{
  for(const [options,status] of [[{leaseId:'active',leaseUntil:Date.now()+60000},409],[{leaseId:null,leaseUntil:Date.now()+60000},429],[{owned:false},404]]){const fixture=await syncRouteFixture(options);assert.equal((await fixture.run()).status,status);assert.equal(fixture.calls(),0);}
});
test('sync route acquires an expired lease for one refresh with a 240-second bound',async()=>{
  const fixture=await syncRouteFixture({leaseId:'expired',leaseUntil:Date.now()-1}),start=Date.now(),response=await fixture.run();assert.equal(response.status,200);assert.deepEqual(await response.json(),{done:true,processed:25});assert.equal(fixture.calls(),1);assert.equal(fixture.state.leaseId,'new-lease');assert(fixture.state.leaseUntil>=start+240000);assert.equal(fixture.handler.maxDuration,120);
});
test('failed sync releases into cooldown while preserving saved checkpoints and cannot release a replacement lease',async()=>{
  for(const replaceOnFailure of [false,true]){const fixture=await syncRouteFixture({syncError:new HttpError(502,'Provider interrupted'),replaceOnFailure}),start=Date.now(),response=await fixture.run();assert.equal(response.status,502);assert.equal(fixture.state.phase,'full');assert.equal(fixture.state.pageToken,'saved-page');assert.equal(fixture.state.historyId,'saved-history');assert.equal(fixture.state.queue,'["saved"]');if(replaceOnFailure)assert.equal(fixture.state.leaseId,'replacement');else{assert.equal(fixture.state.leaseId,null);assert(fixture.state.leaseUntil>=start+60000);assert.equal(fixture.state.error,'Provider interrupted');assert.equal((await fixture.run()).status,429);assert.equal(fixture.calls(),1);}}
});
