import test from 'node:test';
import assert from 'node:assert/strict';
import {CallEngine} from '../lib/call-engine.ts';

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function harness(run){
  const names=['setTimeout','clearTimeout','setInterval','clearInterval','RTCPeerConnection','MediaStream'];
  const saved=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const timers=[],peers=[],requests=[],errors=[],states=[];
  class Stream {getTracks(){return [];}getAudioTracks(){return [];}getVideoTracks(){return [];}}
  class Peer {
    connectionState='new';remoteDescription=null;localDescription=null;descriptions=[];candidates=[];closed=false;
    constructor(){peers.push(this);}
    addTrack(){}
    async setRemoteDescription(description){this.remoteDescription=description;this.descriptions.push(description);}
    async addIceCandidate(candidate){this.candidates.push(candidate);}
    async createAnswer(){return {type:'answer',sdp:'answer'};}
    async createOffer(){return {type:'offer',sdp:'offer'};}
    async setLocalDescription(description){this.localDescription=description;}
    close(){this.closed=true;}
  }
  globalThis.MediaStream=Stream;globalThis.RTCPeerConnection=Peer;
  globalThis.setTimeout=(fn,ms)=>{const timer={fn,ms,cleared:false};timers.push(timer);return timer;};
  globalThis.setInterval=(fn,ms)=>{const timer={fn,ms,cleared:false};timers.push(timer);return timer;};
  globalThis.clearTimeout=globalThis.clearInterval=timer=>{timer.cleared=true;};
  const options={roomId:'room',userId:'callee',clientId:'device-callee',request:async(path,method,body)=>{requests.push({path,method,body});return {iceServers:[]};},mediaFactory:async()=>new Stream(),local:()=>{},remote:()=>{},state:value=>states.push(value),remoteMedia:()=>{},error:value=>errors.push(value)};
  const engine=new CallEngine(options);
  const call={id:'first-call',roomId:'room',status:'active',callerId:'caller',callerClientId:'device-caller',calleeId:'callee',calleeClientId:'device-callee'};
  engine.stream=new Stream();
  try{await run({engine,options,call,timers,peers,requests,errors,states,Stream});}finally{
    engine.stop();for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
}
const offer={type:'description',description:{type:'offer',sdp:'early-offer'}};
const ice={type:'ice',candidate:{candidate:'candidate:early'}};

test('poll retries early SDP and ICE until the accept response attaches the call',()=>harness(async({engine,call,requests})=>{
  let cursor=0;const events=[{id:1,signal:ice},{id:2,signal:offer}];
  const poll=async()=>{await engine.update(call);for(const event of events.filter(event=>event.id>cursor)){if(!await engine.receive(event.signal,call.id))break;cursor=event.id;}};
  await poll();assert.equal(cursor,0);assert.equal(engine.pc,null);
  await engine.attach(call);await poll();
  assert.equal(cursor,2);assert.deepEqual(engine.pc.descriptions,[offer.description]);assert.deepEqual(engine.pc.candidates,[ice.candidate]);
  assert.equal(requests.filter(row=>row.body?.signal?.description?.type==='answer').length,1);
}));

test('a second network disconnection gets a new timeout after recovery',()=>harness(async({engine,call,timers,requests})=>{
  await engine.attach(call);const pc=engine.pc;
  pc.connectionState='disconnected';pc.onconnectionstatechange();
  pc.connectionState='connected';pc.onconnectionstatechange();
  assert.equal(timers.filter(t=>t.ms===15000&&!t.cleared).length,0);
  pc.connectionState='disconnected';pc.onconnectionstatechange();
  const pending=timers.filter(t=>t.ms===15000&&!t.cleared);assert.equal(pending.length,1);
  pending[0].fn();await Promise.resolve();
  assert.equal(engine.pc,null);assert.ok(requests.some(row=>row.body?.action==='hangup'));
}));

test('signals for another call are never applied to the current peer',()=>harness(async({engine,call})=>{
  await engine.attach(call);
  assert.equal(await engine.receive(offer,'other-call'),false);
  assert.equal(await engine.receive(ice,'other-call'),false);
  assert.deepEqual(engine.pc.descriptions,[]);assert.deepEqual(engine.pc.candidates,[]);
}));

test('stopping clears pending ICE before a later call',()=>harness(async({engine,call})=>{
  await engine.attach(call);await engine.receive(ice,call.id);engine.stop();
  await engine.prepare('audio');const second={...call,id:'second-call'};await engine.attach(second);
  assert.equal(await engine.receive(offer,call.id),false);
  assert.equal(await engine.receive(offer,second.id),true);
  assert.deepEqual(engine.pc.candidates,[]);
}));

test('late relay response from a stopped call cannot create or replace a peer',()=>harness(async({engine,options,call,peers})=>{
  const oldRelay=deferred();let reads=0;
  options.request=async()=>++reads===1?oldRelay.promise:{iceServers:[]};
  const firstAttach=engine.attach(call);engine.stop();await engine.prepare('audio');
  const second={...call,id:'second-call'};await engine.attach(second);const currentPeer=engine.pc;
  oldRelay.resolve({iceServers:[]});await firstAttach;
  assert.equal(peers.length,1);assert.equal(engine.pc,currentPeer);assert.equal(engine.call.id,second.id);
}));

test('late relay failure from an old call does not hang up the next call',()=>harness(async({engine,options,call,errors})=>{
  const oldRelay=deferred();let reads=0;
  options.request=async()=>++reads===1?oldRelay.promise:{iceServers:[]};
  const firstAttach=engine.attach(call);engine.stop();await engine.prepare('audio');
  const second={...call,id:'second-call'};await engine.attach(second);
  oldRelay.reject(Error('old relay timeout'));await firstAttach;
  assert.equal(engine.call.id,second.id);assert.deepEqual(errors,[]);
}));

test('pending ICE is bounded and stop releases it',()=>harness(async({engine,call})=>{
  await engine.attach(call);
  for(let i=0;i<256;i++)assert.equal(await engine.receive(ice,call.id),true);
  await assert.rejects(engine.receive(ice,call.id),/Too many pending/);
  engine.stop();assert.equal(await engine.receive(ice,call.id),false);
}));

test('retrying an offer after a failed answer post reuses negotiation instead of applying SDP twice',()=>harness(async({engine,options,call,requests})=>{
  await engine.attach(call);const pc=engine.pc;let sends=0;
  const original=options.request;options.request=async(...args)=>{if(args[2]?.signal?.description?.type==='answer'&&++sends===1)throw Error('temporary answer failure');return original(...args);};
  await assert.rejects(engine.receive(offer,call.id),/temporary answer failure/);
  assert.equal(await engine.receive(offer,call.id),true);assert.equal(pc.descriptions.length,1);assert.equal(sends,2);assert.equal(pc.localDescription.type,'answer');
}));
test('a repeated answer is acknowledged without renegotiating a stable peer',()=>harness(async({engine,call})=>{
  await engine.attach({...call,callerId:'callee',callerClientId:'device-callee',calleeId:'caller',calleeClientId:'device-caller'});
  const answer={type:'description',description:{type:'answer',sdp:'same-answer'}};
  assert.equal(await engine.receive(answer,call.id),true);assert.equal(await engine.receive(answer,call.id),true);assert.deepEqual(engine.pc.descriptions,[answer.description]);
}));
