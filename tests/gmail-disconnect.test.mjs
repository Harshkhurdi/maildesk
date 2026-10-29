import test from 'node:test';
import assert from 'node:assert/strict';
import { isolated, HttpError, json, failure } from './suite-fixture.mjs';
async function fixture({foreign=false,revoke=true,changed=false}={}) {
  const row={id:'account',ownerId:foreign?'other':'owner',token:'encrypted'}, effects=[],accounts={id:'id',ownerId:'ownerId',token:'token'};
  const eq=(key,value)=>r=>r[key]===value,and=(...conditions)=>r=>conditions.every(c=>c(r));
  const db={select:()=>({from:()=>({where:async condition=>condition(row)?[row]:[]})}),update:table=>({set:values=>({where:condition=>({returning:async()=>{if(changed||!condition(row))return [];effects.push({table,values});return [{id:row.id}];}})})}),delete:()=>{throw Error('Disconnect must preserve all stored records.');}};
  const route=await isolated('../app/api/gmail/disconnect/route.ts',{and,eq,accounts,HttpError,json,failure,body:r=>r.json(),guard:async()=>({user:{userId:'owner'},db}),decrypt:async()=>({refreshToken:'fixture-refresh'}),encrypt:async value=>{assert.deepEqual(value,{refreshToken:null,scopes:[]});return 'disconnected-encrypted';},fetch:async()=>{effects.push('revoke');return new Response('',{status:revoke?200:503});}});
  return {effects,run:()=>route.POST(new Request('https://app.example.test/disconnect',{method:'POST',body:JSON.stringify({accountId:'account'})}))};
}
test('disconnect revokes Google access and disables only the owned credential without deleting data',async()=>{
  const f=await fixture(),response=await f.run();assert.equal(response.status,200);const result=await response.json();assert.equal(result.disconnected,true);assert.equal(result.revoked,true);assert.equal(f.effects.length,2);assert.equal(f.effects[1].values.phase,'disconnected');assert.equal(f.effects[1].values.token,'disconnected-encrypted');assert.match(result.message,/kept/);
});
test('failed Google revocation still disables local access and reports the unconfirmed revocation',async()=>{const f=await fixture({revoke:false}),result=await (await f.run()).json();assert.equal(result.revoked,false);assert.match(result.message,/could not be confirmed/);assert.equal(f.effects[1].values.phase,'disconnected');});
test('foreign accounts and concurrently replaced credentials cannot be disconnected silently',async()=>{const foreign=await fixture({foreign:true});assert.equal((await foreign.run()).status,404);assert.deepEqual(foreign.effects,[]);const changed=await fixture({changed:true});assert.equal((await changed.run()).status,409);assert.equal(changed.effects.length,1);});
