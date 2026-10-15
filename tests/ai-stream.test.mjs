import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {chatRequest} from '../lib/ai-studio/chat-request.ts';
// Next resolves extensionless TypeScript imports; use the same resolution for
// this direct Node test without changing the application's import conventions.
const moduleHooks=registerHooks({resolve(specifier,context,nextResolve){try{return nextResolve(specifier,context);}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(specifier+'.ts',context);throw error;}}});
const {streamChatClient}=await import('../lib/ai-studio/chat/streamClient.ts');
moduleHooks.deregister();
test('stream client uses the server contract, assembles deltas, and reports usage',async()=>{const original=globalThis.fetch;let request;globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/ai/chat');request=JSON.parse(init.body);return new Response('data: {"choices":[{"delta":{"content":"Hello "}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"there"}}],"usage":{"completion_tokens":2}}\r\n\r\ndata: [DONE]\r\n\r\n',{headers:{'Content-Type':'text/event-stream'}});};try{const result=await streamChatClient({model:'test:free',messages:[{role:'user',content:'Test'}],jsonMode:true,maxTokens:64,temperature:0.7,onDelta:()=>{}});assert.equal(chatRequest.safeParse(request).success,true);assert.equal(request.maxTokens,64);assert.equal(request.jsonMode,true);assert.equal(result.content,'Hello there');assert.equal(result.completionTokens,2);}finally{globalThis.fetch=original;}});
test('provider errors in a successful HTTP stream are visible failures',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response('data: {"error":{"message":"Model pool unavailable"}}\n\n');try{await assert.rejects(()=>streamChatClient({model:'test:free',messages:[{role:'user',content:'Test'}],onDelta:()=>{}}),/Model pool unavailable/);}finally{globalThis.fetch=original;}});

async function withStream(body,run){const original=globalThis.fetch;globalThis.fetch=async()=>new Response(body,{headers:{'Content-Type':'text/event-stream'}});try{return await run();}finally{globalThis.fetch=original;}}
const options=onDelta=>({model:'test:free',messages:[{role:'user',content:'Test'}],onDelta});
test('premature stream EOF rejects while retaining already delivered content and reasoning',async()=>{
  const deltas=[];
  await withStream('data: {"choices":[{"delta":{"content":"Partial answer","reasoning":"Partial reasoning"}}]}\n\n',async()=>{
    await assert.rejects(streamChatClient(options(delta=>deltas.push(delta))),/ended before it was complete.*partial reply is kept; retry/i);
  });
  assert.equal(deltas.map(delta=>delta.content??'').join(''),'Partial answer');assert.equal(deltas.map(delta=>delta.reasoning??'').join(''),'Partial reasoning');
});
test('a finish reason completes the reply even without a final DONE marker',async()=>{
  await withStream('data: {"choices":[{"delta":{"content":"Complete"},"finish_reason":"stop"}]}\n\n',async()=>{
    const result=await streamChatClient(options(()=>{}));assert.equal(result.content,'Complete');assert.equal(result.finishReason,'stop');
  });
});
test('final DONE markers are recognized when split across network chunks without a trailing separator',async()=>{
  const encoder=new TextEncoder();
  const stream=new ReadableStream({start(controller){for(const chunk of ['data: {"choices":[{"delta":{"content":"Complete"}}]}\n\n','data: [DO','NE]'])controller.enqueue(encoder.encode(chunk));controller.close();}});
  await withStream(stream,async()=>assert.equal((await streamChatClient(options(()=>{}))).content,'Complete'));
});
test('caller cancellation is an AbortError rather than a premature completion error',async()=>{
  const controller=new AbortController(),deltas=[];
  await withStream('data: {"choices":[{"delta":{"content":"Keep this partial text"}}]}\n\n',async()=>{
    await assert.rejects(streamChatClient({...options(delta=>{deltas.push(delta);controller.abort();}),signal:controller.signal}),error=>error.name==='AbortError');
  });
  assert.equal(deltas[0].content,'Keep this partial text');
});
test('empty or malformed streams cannot silently complete without a provider marker',async()=>{
  for(const body of ['', 'data: {broken\n\n', 'data: {"choices":[{"delta":{"content":"Partial"},"finish_reason":null}]}\n\n'])await withStream(body,async()=>assert.rejects(streamChatClient(options(()=>{})),/ended before it was complete/));
});
