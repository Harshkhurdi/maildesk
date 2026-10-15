import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// The production handler runs against isolated memory state. Provider calls,
// tokens and database transactions below are fixtures only.
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const oldFeed={view:'home',posts:[{id:'saved-post',text:'Previously saved timeline'}],users:[]};
async function fixture({expiresAt=0,refreshError,timeline=async()=>Response.json({data:[{id:'new-post',text:'Fresh timeline'}],meta:{result_count:1}})}={}){
  const rows=[{ownerId:'owner',xId:'fixture-x-user',username:'fixture',name:'Fixture',token:JSON.stringify({access_token:'old-access',refresh_token:'old-refresh',expiresAt}),feed:JSON.stringify(oldFeed),fetchedAt:0,updatedAt:'2026-10-14T00:00:00.000Z'}];
  const xConnections={ownerId:'ownerId',xId:'xId',token:'token'};
  const eq=(field,value)=>row=>row[field]===value,and=(...conditions)=>row=>conditions.every(condition=>condition(row));
  let refreshes=0,timelineRequests=0,commits=0,rollbacks=0;
  const db={
    select(){return {from(table){assert.equal(table,xConnections);return {where(condition){return {for:async mode=>{assert.equal(mode,'update');return rows.filter(condition).map(row=>({...row}));}};}};}};},
    update(table){assert.equal(table,xConnections);return {set(values){return {where(condition){let result;const apply=()=>{if(result)return result;result=rows.filter(condition);for(const row of result)Object.assign(row,values);return result;};return {returning:async()=>apply().map(row=>({xId:row.xId})),then(resolve,reject){return Promise.resolve().then(apply).then(resolve,reject);}};}};}};},
    delete(table){assert.equal(table,xConnections);return {async where(condition){for(let index=rows.length-1;index>=0;index--)if(condition(rows[index]))rows.splice(index,1);}};},
    async transaction(callback){const snapshot=structuredClone(rows);try{const result=await callback(db);commits++;return result;}catch(error){rollbacks++;rows.splice(0,rows.length,...snapshot);throw error;}},
  };
  const bindings={xConnections,eq,and,HttpError,guard:async()=>({user:{userId:'owner'},db}),body:request=>request.json(),xReady:()=>true,config:()=>({origin:'https://maildesk.test'}),now:()=>new Date().toISOString(),
    decrypt:async value=>JSON.parse(value),encrypt:async value=>JSON.stringify(value),json:data=>Response.json(data),failure:error=>Response.json({error:error.message},{status:error.status??500}),
    xToken:async values=>{refreshes++;assert.deepEqual(values,{grant_type:'refresh_token',refresh_token:'old-refresh'});if(refreshError)throw refreshError;return {access_token:'rotated-access',refresh_token:'rotated-refresh',expiresAt:Date.now()+7200000};},
    fetch:async(url,init)=>{timelineRequests++;assert.equal(new URL(url).hostname,'api.x.com');assert.match(init.headers.Authorization,/^Bearer (?:rotated|old)-access$/);return timeline({rows,url,init});},
  };
  const source=(await readFile(new URL('../app/api/x/route.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const key='x_fixture_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=bindings;
  let handler;try{handler=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));}finally{delete globalThis[key];}
  const post=()=>handler.POST(new Request('https://maildesk.test/api/x',{method:'POST',body:JSON.stringify({view:'home'})}));
  return {rows,post,counts:()=>({refreshes,timelineRequests,commits,rollbacks}),disconnect:()=>handler.DELETE(new Request('https://maildesk.test/api/x',{method:'DELETE',body:'{}'}))};
}
test('X rotated tokens and retry checkpoint survive a subsequent timeline network failure',async()=>{
  const state=await fixture({timeline:async()=>{throw new DOMException('fixture timeout','TimeoutError');}});
  const response=await state.post();assert.equal(response.status,503);assert.equal(JSON.parse(state.rows[0].token).refresh_token,'rotated-refresh');
  assert.equal(state.rows[0].fetchedAt,0);assert.deepEqual(JSON.parse(state.rows[0].feed).posts,oldFeed.posts);assert(JSON.parse(state.rows[0].feed).lastAttemptAt>0);
  assert.deepEqual(state.counts(),{refreshes:1,timelineRequests:1,commits:1,rollbacks:0});
});
test('X rotated tokens remain committed when its timeline contains invalid JSON',async()=>{
  const state=await fixture({timeline:async()=>new Response('not json')});
  const response=await state.post();assert.equal(response.status,502);assert.equal(JSON.parse(state.rows[0].token).refresh_token,'rotated-refresh');
  assert.deepEqual(JSON.parse(state.rows[0].feed).posts,oldFeed.posts);assert(JSON.parse(state.rows[0].feed).lastAttemptAt>0);assert.equal(state.counts().rollbacks,0);
});
test('a failed X token refresh commits its attempt checkpoint and throttles another attempt',async()=>{
  const state=await fixture({refreshError:new HttpError(502,'Fixture token endpoint unavailable')});
  assert.equal((await state.post()).status,502);assert.equal(JSON.parse(state.rows[0].token).refresh_token,'old-refresh');assert(JSON.parse(state.rows[0].feed).lastAttemptAt>0);
  assert.equal((await state.post()).status,429);assert.equal(state.counts().refreshes,1);assert.equal(state.counts().timelineRequests,0);
});
test('timeline failure is throttled even after its refreshed credentials were saved',async()=>{
  const state=await fixture({timeline:async()=>{throw Error('fixture network');}});
  assert.equal((await state.post()).status,503);assert.equal((await state.post()).status,429);
  assert.equal(state.counts().refreshes,1);assert.equal(state.counts().timelineRequests,1);
});
test('an X provider rate limit remains HTTP 429 and preserves the saved timeline',async()=>{
  const state=await fixture({timeline:async()=>Response.json({error:'Rate limited'},{status:429})});
  assert.equal((await state.post()).status,429);assert.deepEqual(JSON.parse(state.rows[0].feed).posts,oldFeed.posts);assert.equal(JSON.parse(state.rows[0].token).refresh_token,'rotated-refresh');
});
test('disconnect during an X timeline fetch prevents a stale result from recreating its connection',async()=>{
  let disconnect;
  const state=await fixture({timeline:async()=>{assert.equal((await disconnect()).status,200);return Response.json({data:[{id:'stale-post'}]});}});disconnect=state.disconnect;
  assert.equal((await state.post()).status,409);assert.equal(state.rows.length,0);
});
test('reconnecting the same X account during a fetch prevents stale timeline overwrite',async()=>{
  const replacementFeed={view:'own',posts:[{id:'reconnected-post'}],users:[]};
  const state=await fixture({timeline:async({rows})=>{rows[0].token=JSON.stringify({access_token:'reconnected-access',refresh_token:'reconnected-refresh',expiresAt:Date.now()+7200000});rows[0].feed=JSON.stringify(replacementFeed);return Response.json({data:[{id:'stale-post'}]});}});
  assert.equal((await state.post()).status,409);assert.deepEqual(JSON.parse(state.rows[0].feed),replacementFeed);assert.equal(JSON.parse(state.rows[0].token).refresh_token,'reconnected-refresh');
});
test('successful X refresh persists its feed and subsequent calls respect the refresh interval',async()=>{
  const state=await fixture({expiresAt:Date.now()+7200000});
  const response=await state.post();assert.equal(response.status,200);assert.equal((await response.json()).feed.posts[0].id,'new-post');assert(state.rows[0].fetchedAt>0);
  assert.equal((await state.post()).status,429);assert.equal(state.counts().refreshes,0);assert.equal(state.counts().timelineRequests,1);
});
test('malformed X timeline shapes cannot replace the saved feed with an empty one',async()=>{
  for(const payload of [[],{}, {data:{}},{data:[],includes:{users:{}}},{errors:[{message:'provider failure'}]}]){
    const state=await fixture({timeline:async()=>Response.json(payload)});
    assert.equal((await state.post()).status,502);assert.deepEqual(JSON.parse(state.rows[0].feed).posts,oldFeed.posts);
    assert.equal(JSON.parse(state.rows[0].token).refresh_token,'rotated-refresh');
  }
});
test('an explicitly empty X timeline is valid',async()=>{
  const state=await fixture({timeline:async()=>Response.json({meta:{result_count:0}})});
  const response=await state.post();assert.equal(response.status,200);assert.deepEqual((await response.json()).feed.posts,[]);
});
