import test from 'node:test';
import assert from 'node:assert/strict';
import {readSession,SessionUnavailableError} from '../lib/session-reader.ts';
test('returns the provider result after successful verification',async()=>{
  const data={session:'provider-result'};
  assert.equal(await readSession(async()=>({data,error:null})),data);
});
test('an absent session stays signed out without retries',async()=>{
  let calls=0;assert.equal(await readSession(async()=>{calls++;return {data:null,error:null};}),null);assert.equal(calls,1);
});
test('retries a temporary provider failure once, then uses only its verified response',async()=>{
  let calls=0;const data={session:'provider-result'};
  assert.equal(await readSession(async()=>++calls===1?{data:null,error:{status:502}}:{data,error:null}),data);assert.equal(calls,2);
});
test('retries a transport exception once',async()=>{
  let calls=0;assert.equal(await readSession(async()=>{if(++calls===1)throw Error('network');return {data:null,error:null};}),null);assert.equal(calls,2);
});
test('persistent provider failure is unavailable, not an expired login',async()=>{
  let calls=0;await assert.rejects(readSession(async()=>{calls++;return {data:{session:'must-not-be-used'},error:{status:503}};}),SessionUnavailableError);assert.equal(calls,2);
});
test('rejected credentials do not retry or accept data accompanying an error',async()=>{
  for(const status of [401,403]){let calls=0;assert.equal(await readSession(async()=>{calls++;return {data:{session:'must-not-be-used'},error:{status}};}),null);assert.equal(calls,1);}
});
