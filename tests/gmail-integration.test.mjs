import test from 'node:test';
import assert from 'node:assert/strict';
import {isolated} from './suite-fixture.mjs';
import {requestedGoogleScopes} from '../lib/outlook-policy.ts';

// Exercise the real handlers with in-memory dependencies. No accounts, provider
// requests, environment credentials, or persistent database are used.
async function isolatedModule(path,bindings){ return isolated(path,{requestedGoogleScopes,...bindings}); }
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

test('HTML email previews keep table cells, semantic blocks and encoded spaces separate',async()=>{
  const gmail=await tokenModule(async()=>Response.json({}));
  const text=gmail.htmlToText('<table><tr><td>Invoice</td><td>Amount</td></tr><tr><td>Hello&#32;world</td><td>₹&#x20;30</td></tr></table><section>Next step</section><section>Another step</section>');
  assert.match(text,/Invoice\tAmount/);assert.match(text,/Hello world/);assert.match(text,/₹ 30/);assert.match(text,/Next step\n+Another step/);
  assert.equal(gmail.htmlToText('Hello <b>world</b> with spaces'),'Hello world with spaces');
});
