import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCallAction} from '../lib/call-action.ts';
const call={id:'new-call',roomId:'room',kind:'video',status:'ringing',callerId:'me',callerClientId:'this-device',calleeId:null,calleeClientId:null};
const settings={roomId:'room',userId:'me',clientId:'this-device',action:'start',kind:'video',previousCallId:'previous-call'};

test('successful call action returns directly without a recovery read',async()=>{
  const requests=[];const response={call};
  assert.equal(await requestCallAction({...settings,request:async(...args)=>{requests.push(args);return response;}}),response);
  assert.equal(requests.length,1);assert.equal(requests[0][1],'POST');
});
test('lost start response recovers only its committed call without retrying the mutation',async()=>{
  const requests=[];
  const recovered=await requestCallAction({...settings,request:async(...args)=>{requests.push(args);if(args[1]==='POST')throw Error('connection lost');return {call};}});
  assert.equal(recovered.call,call);assert.equal(requests.length,2);assert.equal(requests.filter(args=>args[1]==='POST').length,1);
  const url=new URL(requests[1][0],'https://workspace.test');assert.equal(url.searchParams.get('room'),'room');assert.equal(url.searchParams.get('client'),'this-device');
});
test('lost accept response recovers the exact active call accepted on this device',async()=>{
  const accepted={...call,status:'active',callerId:'other',callerClientId:'other-device',calleeId:'me',calleeClientId:'this-device'};
  const result=await requestCallAction({...settings,action:'accept',callId:call.id,request:async(_path,method)=>{if(method==='POST')throw Error('response lost');return {call:accepted};}});
  assert.equal(result.call,accepted);
});
test('recovery rejects old calls, other rooms, other people, other devices, and ended calls',async()=>{
  const error=Error('original action failure');
  for(const candidate of [null,{...call,id:'previous-call'},{...call,roomId:'other'},{...call,callerId:'other'},{...call,callerClientId:'other'},{...call,kind:'audio'},{...call,status:'ended'},{...call,status:'missed'},{...call,id:''}]){
    let requests=0;
    await assert.rejects(requestCallAction({...settings,request:async(_path,method)=>{requests++;if(method==='POST')throw error;return {call:candidate};}}),value=>value===error);
    assert.equal(requests,2);
  }
});
test('accept recovery rejects a ringing call or a different accepted call',async()=>{
  const error=Error('original accept failure');
  const accepted={...call,status:'active',calleeId:'me',calleeClientId:'this-device'};
  for(const candidate of [{...accepted,id:'different-call'},{...accepted,status:'ringing'},{...accepted,calleeId:'other'},{...accepted,calleeClientId:'other-device'}]){
    await assert.rejects(requestCallAction({...settings,action:'accept',callId:call.id,request:async(_path,method)=>{if(method==='POST')throw error;return {call:candidate};}}),value=>value===error);
  }
});
test('an unavailable recovery read preserves the original failure and stays bounded',async()=>{
  const error=Error('original action failure');let requests=0;
  await assert.rejects(requestCallAction({...settings,request:async(_path,method)=>{requests++;throw method==='POST'?error:Error('poll unavailable');}}),value=>value===error);
  assert.equal(requests,2);
});
