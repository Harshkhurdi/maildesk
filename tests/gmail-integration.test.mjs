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

async function callbackModule({profileEmail=account.email,stateOwner='owner',targetOwner='owner',rawState,storedState}={}){
  const state=rawState??`gmail-reconnect:${account.id}:${crypto.randomUUID()}`;
  const savedState={id:storedState??state,ownerId:stateOwner,verifier:'fixture-verifier',expiresAt:Date.now()+600000};
  const storedAccount={...account,ownerId:targetOwner};
  const accounts={id:'id',ownerId:'ownerId',email:'email'},oauthStates={id:'id',ownerId:'ownerId'};
  const eq=(field,value)=>row=>row[field]===value,and=(...conditions)=>row=>conditions.every(condition=>condition(row));
  let exchanges=0,encrypted=0,updates=0;
  const db={
    delete(table){assert.equal(table,oauthStates);return {where(condition){return {async returning(){return condition(savedState)?[savedState]:[];}};}};},
    select(){return {from(table){assert.equal(table,accounts);return {async where(condition){return condition(storedAccount)?[storedAccount]:[];}};}};},
    update(table){assert.equal(table,accounts);return {set(values){return {async where(condition){if(condition(storedAccount)){updates++;Object.assign(storedAccount,values);}}};}};},
  };
  const handler=await isolatedModule('../app/api/gmail/callback/route.ts',{
    accounts,oauthStates,eq,and,HttpError,guard:async()=>({user:{userId:'owner'},db}),
    config:()=>({clientId:'fixture-client',clientSecret:'fixture-secret',origin:'https://maildesk.test'}),
    encrypt:async()=>{encrypted++;return 'replacement-encrypted-token';},
    fetch:async url=>{if(url==='https://oauth2.googleapis.com/token'){exchanges++;return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',scope:'https://www.googleapis.com/auth/gmail.readonly'});}assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/profile');return Response.json({emailAddress:profileEmail,historyId:'100'});},
  });
  const run=()=>handler.GET(new Request(`https://maildesk.test/api/gmail/callback?${new URLSearchParams({state,code:'fixture-code'})}`,{headers:{cookie:`maildesk_oauth=${state}`}}));
  return {run,storedAccount,counts:()=>({exchanges,encrypted,updates})};
}
test('Gmail reconnect callback updates only the persisted owned target',async()=>{
  const fixture=await callbackModule({profileEmail:account.email.toUpperCase()});const response=await fixture.run();
  assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location')).searchParams.get('connected'),'1');
  assert.equal(fixture.storedAccount.token,'replacement-encrypted-token');assert.deepEqual(fixture.counts(),{exchanges:1,encrypted:1,updates:1});
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
function gmailThread(threadId){return {messages:[{id:`message-${threadId}`,threadId,labelIds:['INBOX'],internalDate:'1791964800000',payload:{mimeType:'text/plain',body:{data:Buffer.from('Status update.').toString('base64url')},headers:[{name:'subject',value:'Update'}]}}]};}
async function syncFixture({initial={},cached=[],tasks:initialTasks=[],provider}={}){
  const accounts={id:'id',leaseId:'leaseId'},mail={id:'id',accountId:'accountId',threadId:'threadId'},tasks={id:'id',accountId:'accountId',threadId:'threadId',sourceId:'sourceId'};
  const state={...account,phase:'ready',pageToken:null,historyId:'old-history',nextHistoryId:null,queue:'[]',total:cached.length,scanned:cached.length,syncedAt:null,error:null,leaseId:'lease',leaseUntil:0,...initial};
  const tables=new Map([[accounts,[state]],[mail,cached.map(value=>typeof value==='string'?cachedMessage(value):{...value})],[tasks,structuredClone(initialTasks)]]),requests=[],queries=[],checkpoints=[];
  const eq=(field,value)=>row=>row[field]===value,gt=(field,value)=>row=>row[field]>value,and=(...conditions)=>row=>conditions.filter(Boolean).every(condition=>condition(row));
  function query(table,projection,distinct){
    let condition=()=>true,order=null,maximum=Infinity;
    function rows(){let values=tables.get(table).filter(condition);if(projection?.n==='count')return [{n:values.length}];if(projection)values=values.map(row=>Object.fromEntries(Object.entries(projection).map(([key,field])=>[key,row[field]])));if(distinct)values=[...new Map(values.map(row=>[JSON.stringify(row),row])).values()];if(order)values.sort((left,right)=>left[order]<right[order]?-1:left[order]>right[order]?1:0);return values.slice(0,maximum).map(row=>({...row}));}
    const chain={where(value){condition=value;return chain;},orderBy(value){order=value;return chain;},limit(value){maximum=value;queries.push({distinct,maximum});return chain;},then(resolve,reject){return Promise.resolve().then(rows).then(resolve,reject);}};
    return chain;
  }
  const db={
    select(projection){return {from:table=>query(table,projection,false)};},selectDistinct(projection){return {from:table=>query(table,projection,true)};},
    update(table){return {set(values){return {where(condition){let result;function apply(){if(result)return result;result=tables.get(table).filter(condition);for(const row of result)Object.assign(row,values);if(table===accounts&&result.length)checkpoints.push({...values});return result;}return {returning:async()=>apply().map(row=>({id:row.id})),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};}};}};},
    delete(table){return {async where(condition){tables.set(table,tables.get(table).filter(row=>!condition(row)));}};},
    insert(table){return {values(value){return {async onConflictDoUpdate(){const rows=tables.get(table),existing=rows.find(row=>row.id===value.id);if(existing)Object.assign(existing,value);else rows.push({...value});}};}};},
    transaction:async callback=>callback(db),
  };
  const gmail=await isolatedModule('../lib/gmail.ts',{
    accounts,mail,tasks,eq,gt,and,asc:field=>field,count:()=> 'count',inArray:(field,values)=>row=>values.includes(row[field]),
    sql:(strings,...values)=>/!=/.test(strings.join(''))&&values.length===2?row=>row[values[0]]!==values[1]:()=>true,
    getDb:()=>db,HttpError,config:()=>({clientId:'fixture',clientSecret:'fixture'}),decrypt:async()=>({refreshToken:'fixture'}),now:()=>new Date().toISOString(),
    unbase64:value=>new Uint8Array(Buffer.from(value,'base64url')),safeUrl,suggestTask,
    fetch:async url=>{if(String(url).endsWith('/token'))return Response.json({access_token:'fixture'});const path=String(url).split('/users/me/')[1];requests.push(path);return provider(path);},
  });
  return {state,requests,queries,checkpoints,mail:()=>tables.get(mail),tasks:()=>tables.get(tasks),run:()=>{state.leaseId='lease';return gmail.syncBatch({...state},'lease');},runWithReplacedLease:()=>{state.leaseId='replacement';return gmail.syncBatch({...state},'lease');}};
}
test('expired Gmail history starts a bounded rescan with a new captured history baseline',async()=>{
  const fixture=await syncFixture({cached:Array.from({length:50},(_,index)=>`old-${index}`),provider:async path=>path.startsWith('history?')?Response.json({}, {status:404}):Response.json({historyId:'new-baseline',messagesTotal:25})});
  assert.deepEqual(await fixture.run(),{done:false,rescan:true,processed:0});
  assert.equal(fixture.state.phase,'rescan');assert.equal(fixture.state.historyId,'new-baseline');assert.equal(fixture.state.pageToken,null);assert.equal(fixture.state.queue,'[]');assert.equal(fixture.mail().length,50);
});
test('expired-history reset refuses a replaced scan lease',async()=>{
  const fixture=await syncFixture({provider:async path=>path.startsWith('history?')?Response.json({}, {status:404}):Response.json({historyId:'new-baseline'})});
  await assert.rejects(fixture.runWithReplacedLease(),error=>error.status===409);assert.equal(fixture.state.phase,'ready');assert.equal(fixture.checkpoints.length,0);
});
test('rescan listing finishes into reconciliation without declaring the mailbox ready',async()=>{
  const fixture=await syncFixture({initial:{phase:'rescan'},cached:['missing'],provider:async path=>{assert.match(path,/^threads\?/);return Response.json({threads:[]});}});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'reconcile');assert.equal(fixture.state.pageToken,null);assert.equal(fixture.mail().length,1);
});
test('rescan listing persists Gmail pagination then clears it before lexical reconciliation',async()=>{
  const fixture=await syncFixture({initial:{phase:'rescan'},provider:async path=>{
    if(path.startsWith('threads/'))return Response.json(gmailThread('existing'));
    const params=new URLSearchParams(path.split('?')[1]);assert.match(path,/^threads\?/);
    return params.has('pageToken')?(assert.equal(params.get('pageToken'),'google-next'),Response.json({threads:[]})):Response.json({threads:[{id:'existing'}],nextPageToken:'google-next'});
  }});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'rescan');assert.equal(fixture.state.pageToken,'google-next');
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'reconcile');assert.equal(fixture.state.pageToken,null);
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'catchup');assert.equal(fixture.state.pageToken,null);
});
test('an interrupted rescan retains its saved Gmail page and cached mail until the batch can retry',async()=>{
  let fail=true;
  const fixture=await syncFixture({initial:{phase:'rescan',pageToken:'saved-google-page'},cached:['missing'],provider:async path=>{
    if(path.startsWith('threads?')){assert.equal(new URLSearchParams(path.split('?')[1]).get('pageToken'),'saved-google-page');return Response.json({threads:[{id:'new-a'},{id:'new-b'}],nextPageToken:'next-google-page'});}
    const id=decodeURIComponent(path.match(/^threads\/([^?]+)/)[1]);return id==='new-b'&&fail?Response.json({}, {status:503}):Response.json(gmailThread(id));
  }});
  await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.state.phase,'rescan');assert.equal(fixture.state.pageToken,'saved-google-page');assert.equal(fixture.checkpoints.length,0);
  assert.deepEqual(fixture.mail().map(row=>row.threadId).sort(),['missing','new-a']);
  fail=false;assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'rescan');assert.equal(fixture.state.pageToken,'next-google-page');
  assert.deepEqual(fixture.mail().map(row=>row.threadId).sort(),['missing','new-a','new-b']);assert.equal(fixture.state.queue,'[]');
});
test('reconciliation uses bounded lexical pages and saves its cursor only after a successful batch',async()=>{
  let fail=true;
  const fixture=await syncFixture({initial:{phase:'reconcile'},cached:['a','b','c','d','e','f','g'],provider:async path=>{const id=decodeURIComponent(path.match(/^threads\/([^?]+)/)[1]);if(id==='b'&&fail)return Response.json({}, {status:503});return Response.json(gmailThread(id));}});
  await assert.rejects(fixture.run(),error=>error.status===502);assert.equal(fixture.state.pageToken,null);assert.equal(fixture.checkpoints.length,0);assert.equal(fixture.mail().length,7);
  fail=false;assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'reconcile');assert.equal(fixture.state.pageToken,'e');assert.equal(fixture.state.queue,'[]');
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'catchup');assert.equal(fixture.state.pageToken,null);assert.equal(fixture.state.historyId,'old-history');
  assert(fixture.queries.filter(query=>query.distinct).every(query=>query.maximum===5));
  assert.deepEqual(fixture.requests.slice(-2),['threads/f?format=full','threads/g?format=full']);
});
test('reconciliation deletes only authoritative missing threads and keeps their tasks for review',async()=>{
  const task={id:'saved-task',accountId:account.id,threadId:'missing',sourceId:`${account.id}:message-missing`,status:'pending',notes:'Preserve my notes',sourceChanged:0};
  const fixture=await syncFixture({initial:{phase:'reconcile'},cached:['existing','missing'],tasks:[task],provider:async path=>path.startsWith('threads/missing?')?Response.json({}, {status:404}):Response.json(gmailThread('existing'))});
  assert.equal((await fixture.run()).done,false);assert.deepEqual(fixture.mail().map(row=>row.threadId),['existing']);
  assert.equal(fixture.tasks().length,1);assert.equal(fixture.tasks()[0].status,'pending');assert.equal(fixture.tasks()[0].notes,task.notes);assert.equal(fixture.tasks()[0].sourceChanged,1);assert.match(fixture.tasks()[0].reason,/deleted in Gmail/);
  assert.equal(fixture.state.phase,'catchup');assert.equal(fixture.state.pageToken,null);
});
test('reconciliation deduplicates threads, excludes other accounts, and resumes after a deleted last cursor',async()=>{
  const foreign={...cachedMessage('foreign'),id:'foreign-mail',accountId:'another-account',ownerId:'another-owner'};
  const duplicate={...cachedMessage('a'),id:'second-message-in-a'};
  const fixture=await syncFixture({initial:{phase:'reconcile'},cached:['a','b','c','d','e','f',duplicate,foreign],provider:async path=>{
    const id=decodeURIComponent(path.match(/^threads\/([^?]+)/)[1]);return id==='e'?Response.json({}, {status:404}):Response.json(gmailThread(id));
  }});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'reconcile');assert.equal(fixture.state.pageToken,'e');
  assert.deepEqual(fixture.requests,['threads/a?format=full','threads/b?format=full','threads/c?format=full','threads/d?format=full','threads/e?format=full']);
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.requests.at(-1),'threads/f?format=full');assert.equal(fixture.state.phase,'catchup');
  assert(fixture.mail().some(row=>row.id===foreign.id));assert(!fixture.requests.some(path=>path.includes('/foreign?')));
});
test('an empty reconciliation still requires history catchup before becoming ready',async()=>{
  const fixture=await syncFixture({initial:{phase:'reconcile'},provider:async()=>{throw Error('No provider calls needed for empty reconciliation');}});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'catchup');assert.equal(fixture.state.pageToken,null);assert.equal(fixture.requests.length,0);
});
test('reconciliation preserves the captured baseline so catchup sees new or moved mail',async()=>{
  const fixture=await syncFixture({initial:{phase:'reconcile',historyId:'captured-baseline'},cached:['existing'],provider:async path=>{
    if(path.startsWith('history?')){const params=new URLSearchParams(path.split('?')[1]);assert.equal(params.get('startHistoryId'),'captured-baseline');assert.equal(params.has('pageToken'),false);return Response.json({historyId:'final-history',history:[{messagesAdded:[{message:{threadId:'new'}}],labelsAdded:[{message:{threadId:'existing'}}]}]});}
    if(path==='profile')return Response.json({messagesTotal:2});
    return Response.json(gmailThread(decodeURIComponent(path.match(/^threads\/([^?]+)/)[1])));
  }});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'catchup');assert.equal(fixture.state.historyId,'captured-baseline');
  assert.equal((await fixture.run()).done,true);assert.equal(fixture.state.phase,'ready');assert.equal(fixture.state.historyId,'final-history');assert.deepEqual(fixture.mail().map(row=>row.threadId).sort(),['existing','new']);
});
test('fresh full scans keep their original single pass and skip cached-thread reconciliation',async()=>{
  const fixture=await syncFixture({initial:{phase:'full'},provider:async path=>{
    if(path.startsWith('threads?'))return Response.json({threads:[{id:'existing'}]});
    if(path.startsWith('threads/'))return Response.json(gmailThread('existing'));
    if(path.startsWith('history?'))return Response.json({historyId:'final-history'});
    return Response.json({messagesTotal:1});
  }});
  assert.equal((await fixture.run()).done,false);assert.equal(fixture.state.phase,'catchup');assert.equal((await fixture.run()).done,true);
  assert.equal(fixture.requests.filter(path=>path.startsWith('threads/')).length,1);assert.equal(fixture.queries.filter(query=>query.distinct).length,0);
});
