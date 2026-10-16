import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {SignJWT} from 'jose';
import {extractNeonAuthCookies,handleAuthProxyRequest,NEON_AUTH_COOKIE_PREFIX,NEON_AUTH_SESSION_COOKIE_NAME,NEON_AUTH_SESSION_DATA_COOKIE_NAME,parseSetCookies,resolveNeonAuthLogging,validateSessionData} from '@neondatabase/auth/server';
import {readSession,SessionUnavailableError} from '../lib/session-reader.ts';
import {parseJsonObject} from '../lib/request-json.ts';
import {MAX_REQUEST_CHARACTERS,MAX_REQUEST_BYTES} from '../lib/request-limits.ts';

async function isolated(path,bindings){
  const source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const key='route_session_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=bindings;
  try{return await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));}finally{delete globalThis[key];}
}
const secret='synthetic-test-cookie-secret-32-characters';
const timestamp=new Date().toISOString();
const payload=()=>({session:{id:'session-test',userId:'user-test',token:'synthetic-provider-token',expiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:timestamp,updatedAt:timestamp},user:{id:'user-test',email:'owner@example.com',emailVerified:true,name:'Test Owner',createdAt:timestamp,updatedAt:timestamp}});
const expectedUser={userId:'user-test',email:'owner@example.com',displayName:'Test Owner',fullName:'Test Owner'};
const log=resolveNeonAuthLogging({logLevel:'silent'});

async function fixture({handler,token=true,cache,writeError=false}={}){
  const values=new Map([['unrelated','keep']]);if(token)values.set(NEON_AUTH_SESSION_COOKIE_NAME,'synthetic-token');if(cache)values.set(NEON_AUTH_SESSION_DATA_COOKIE_NAME,cache);
  const writes=[],requests=[];let headerReads=0,cookieReads=0;
  const store={get:name=>values.has(name)?{name,value:values.get(name)}:undefined,toString:()=>Array.from(values,([name,value])=>`${name}=${value}`).join('; '),set(name,value,options){if(writeError)throw Error('Cookie write blocked');writes.push({name,value,...options});values.set(name,value);}};
  const get=handler??(request=>handleAuthProxyRequest({request,path:'get-session',baseUrl:'https://provider.example.test/auth',cookieSecret:secret,sessionDataTtl:60,log}));
  const reader=await isolated('../lib/route-session.ts',{cookies:async()=>{cookieReads++;return store;},headers:async()=>{headerReads++;return new Headers({host:'workspace.example.test','x-forwarded-proto':'https',cookie:'stale-original-header','authorization':'Bearer do-not-forward'});},extractNeonAuthCookies,NEON_AUTH_COOKIE_PREFIX,NEON_AUTH_SESSION_COOKIE_NAME,parseSetCookies,readSession,auth:()=>({handler:()=>({GET:async(request,context)=>{assert.deepEqual(await context.params,{path:['get-session']});requests.push(request);return get(request);}})})});
  return {...reader,writes,requests,values,reads:()=>({headerReads,cookieReads})};
}
async function provider(run,respond){
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(input,options)=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.origin,'https://provider.example.test');assert.equal(url.pathname,'/auth/get-session');calls.push({url,options});return respond(calls.length);};
  try{return await run(calls);}finally{globalThis.fetch=original;}
}

test('expired SDK-signed cache renews without upstream Set-Cookie and subsequent route guards reuse it with no upstream reads',async()=>{
  const expired=await new SignJWT(payload()).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-10).sign(new TextEncoder().encode(secret));
  const f=await fixture({cache:expired});
  await provider(async calls=>{
    assert.deepEqual(await f.getRouteChatGPTUser(new Request('https://workspace.example.test/api/mail?disableCookieCache=true&token=do-not-forward')),expectedUser);
    assert.equal(calls.length,2);assert.equal(f.writes.length,1);
    const cookie=f.writes[0];assert.equal(cookie.name,NEON_AUTH_SESSION_DATA_COOKIE_NAME);assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'lax');assert.equal(cookie.path,'/');assert(cookie.maxAge>0&&cookie.maxAge<=60);assert.equal((await validateSessionData(cookie.value,secret)).valid,true);assert.equal((await validateSessionData(cookie.value,'incorrect-secret')).valid,false);
    const claims=JSON.parse(Buffer.from(cookie.value.split('.')[1],'base64url').toString());assert(claims.exp*1000<=Date.now()+60000);
    assert.deepEqual(await f.getRouteChatGPTUser(),expectedUser);assert.equal(calls.length,2);assert.equal(f.writes.length,1);
    assert.deepEqual(f.reads(),{headerReads:2,cookieReads:2});
    for(const request of f.requests){assert.equal(request.url,'https://workspace.example.test/api/auth/get-session');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),null);assert.equal(request.headers.get('origin'),'https://workspace.example.test');assert(!request.headers.get('cookie').includes('unrelated'));}
  },()=>Response.json(payload()));
});

test('missing cache and tampered cache both require real upstream verification before accepting identity',async()=>{
  for(const cache of [undefined,'unsigned-or-tampered-cache']){
    const f=await fixture({cache});await provider(async calls=>{assert.deepEqual(await f.getRouteChatGPTUser(),expectedUser);assert.equal(calls.length,2);assert.equal(f.writes.length,1);},()=>Response.json(payload()));
  }
});

test('missing primary token never authenticates from a cache or contacts the provider',async()=>{
  const f=await fixture({token:false,cache:'untrusted-cache',handler:()=>{throw Error('Must not call auth');}});
  assert.equal(await f.getRouteChatGPTUser(),null);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);assert.deepEqual(f.reads(),{headerReads:1,cookieReads:1});
});

test('real SDK rejected, forbidden and absent sessions stay signed out without committing cookies',async()=>{
  for(const status of [401,403,200]){
    const f=await fixture();await provider(async()=>{assert.equal(await f.getRouteChatGPTUser(),null);assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);},()=>Response.json(status===200?null:{error:'rejected'},{status}));
  }
});

test('real SDK malformed JSON, malformed payloads, upstream HTTP failures and offline service retry then remain unavailable',async()=>{
  for(const respond of [()=>new Response('{broken',{status:200}),()=>Response.json({}),()=>Response.json({...payload(),session:{...payload().session,expiresAt:'invalid-date'}}),()=>Response.json({error:'unavailable'},{status:503}),()=>{throw new TypeError('fetch failed');}]){
    const f=await fixture();await provider(async()=>{await assert.rejects(f.getRouteChatGPTUser(),SessionUnavailableError);assert.equal(f.requests.length,2);assert.equal(f.writes.length,0);},respond);
  }
});

test('malformed or unverified successful responses never commit accompanying SDK cookies',async()=>{
  const changes=[{},[],{session:null}, {...payload(),user:{...payload().user,id:''}},{...payload(),user:{...payload().user,emailVerified:'true'}},{...payload(),user:{...payload().user,email:''}},{...payload(),session:{...payload().session,userId:'someone-else'}},{...payload(),user:{...payload().user,createdAt:'invalid-date'}}];
  for(const data of changes){
    const f=await fixture({handler:()=>Response.json(data,{headers:{'set-cookie':`${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=must-not-commit; Secure; HttpOnly; Max-Age=60`}})});
    await assert.rejects(f.getRouteChatGPTUser(),SessionUnavailableError);assert.equal(f.requests.length,2);assert.equal(f.writes.length,0);
  }
  for(const data of [null,{session:null,user:null},{...payload(),user:{...payload().user,emailVerified:false}},{...payload(),session:{...payload().session,expiresAt:new Date(Date.now()-1000).toISOString()}}]){
    const f=await fixture({handler:()=>Response.json(data,{headers:{'set-cookie':`${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=must-not-commit; Secure; HttpOnly; Max-Age=60`}})});
    assert.equal(await f.getRouteChatGPTUser(),null);assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);
  }
});

test('only SDK auth cookies are copied with their issued attributes after valid success and write errors propagate',async()=>{
  const response=()=>Response.json(payload(),{headers:{'set-cookie':`${NEON_AUTH_SESSION_DATA_COOKIE_NAME}=synthetic-issued; Path=/; Secure; HttpOnly; Max-Age=59; SameSite=Strict, unrelated=discard; Path=/`}});
  const f=await fixture({handler:response});assert.deepEqual(await f.getRouteChatGPTUser(),expectedUser);assert.equal(f.writes.length,1);assert.equal(f.writes[0].sameSite,'strict');assert.equal(f.writes[0].maxAge,59);
  const blocked=await fixture({handler:response,writeError:true});await assert.rejects(blocked.getRouteChatGPTUser(),/Cookie write blocked/);assert.equal(blocked.requests.length,1);
});

test('route guard preserves owner and origin checks, shared access, private no-store errors and unavailable status',async()=>{
  const previous=process.env.WORKSPACE_OWNER_EMAIL;process.env.WORKSPACE_OWNER_EMAIL='owner@example.com';
  try{
    let user=expectedUser,unavailable=false,seen;const db={synthetic:true};
    const server=await isolated('../lib/server.ts',{getRouteChatGPTUser:async request=>{seen=request;if(unavailable)throw new SessionUnavailableError();return user;},getDb:()=>db,parseJsonObject,SessionUnavailableError,MAX_REQUEST_CHARACTERS,MAX_REQUEST_BYTES});
    assert.deepEqual(await server.guard(),{user,db});assert.equal(seen,undefined);
    const request=new Request('https://workspace.example.test/api/tasks',{method:'POST',headers:{origin:process.env.APP_ORIGIN||'https://workspace.example.test'}});assert.deepEqual(await server.guard(request),{user,db});assert.equal(seen,request);
    await assert.rejects(server.guard(new Request(request.url,{method:'POST',headers:{origin:'https://other.example.test'}})),error=>error.status===403);
    user={...expectedUser,email:'guest@example.com'};await assert.rejects(server.guard(),error=>error.status===403);assert.equal((await server.guard(undefined,true)).user.email,user.email);
    user=null;try{await server.guard();assert.fail('Must reject');}catch(error){const response=server.failure(error);assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'private, no-store');}
    unavailable=true;try{await server.guard();assert.fail('Must reject');}catch(error){const response=server.failure(error);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'private, no-store');}
  }finally{if(previous===undefined)delete process.env.WORKSPACE_OWNER_EMAIL;else process.env.WORKSPACE_OWNER_EMAIL=previous;}
});
