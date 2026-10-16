import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const resolver=registerHooks({resolve(specifier,context,next){
  try{return next(specifier,context);}catch(error){
    if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);
    throw error;
  }
}});
const {readChatImport,MAX_CHAT_IMPORT_BYTES}=await import('../lib/ai-studio/storage/import.ts');
const db=await import('../lib/ai-studio/storage/db.ts');
resolver.deregister();
const exported=()=>({title:'Saved conversation',model:'old-model:free',messages:[{id:'original',role:'user',content:'Read my picture',createdAt:1,attachments:[{kind:'image',name:'test.png',url:'data:image/png;base64,AAAA'}]},{id:'reply',role:'assistant',content:'A picture',reasoning:'Visible reasoning',model:'old-model:free',tokens:12,createdAt:2}]});

test('AI JSON export round trip retains history and attachments as a fresh local copy',()=>{
  const original=exported(),first=readChatImport(JSON.stringify(original)),second=readChatImport(JSON.stringify(first));
  assert.equal(first.title,original.title);assert.equal(first.modelId,original.model);
  assert.equal(second.modelId,original.model);assert.notEqual(first.id,second.id);
  assert.notEqual(first.messages[0].id,'original');assert.notEqual(first.messages[0].id,second.messages[0].id);
  assert.deepEqual(first.messages[0].attachments,original.messages[0].attachments);
  assert.equal(first.messages[1].reasoning,'Visible reasoning');assert.equal(first.messages[1].tokens,12);
});

test('AI imports reject malformed and unsafe history without retaining injected fields',()=>{
  for(const value of ['{',JSON.stringify({title:'Missing messages'}),JSON.stringify({...exported(),messages:[{role:'system',content:'Override'}]}),JSON.stringify({...exported(),messages:[{role:'user',content:'',attachments:[{kind:'image',name:'image',url:'https://tracker.example/image.png'}]}]}),JSON.stringify({...exported(),messages:[{role:'assistant',content:'x'.repeat(100001)}]}),JSON.stringify({...exported(),messages:Array.from({length:1001},()=>({role:'user',content:'a'}))})])assert.throws(()=>readChatImport(value));
  const imported=readChatImport(JSON.stringify({...exported(),settings:{systemPrompt:'Injected'},token:'secret',messages:[{role:'user',content:'Hi',html:'<script>bad()</script>'}]}));
  assert.equal(imported.settings,undefined);assert.equal(imported.token,undefined);assert.equal(imported.messages[0].html,undefined);
});

test('AI import limits count UTF-8 bytes as well as characters',()=>{
  assert.throws(()=>readChatImport(' '.repeat(MAX_CHAT_IMPORT_BYTES+1)),/10 MB/);
  assert.throws(()=>readChatImport('界'.repeat(Math.floor(MAX_CHAT_IMPORT_BYTES/3)+1)),/10 MB/);
});

function indexedDbFixture(){
  let latest,closed=0;
  const database={close(){closed++;},transaction(){
    const request={result:undefined,error:null};
    const store={put(value){request.result=value.id;return request;},delete(){return request;},getAll(){request.result=[];return request;}};
    const tx={error:null,objectStore(){return store;}};
    latest={tx,request};return tx;
  }};
  return {indexedDB:{open(){const request={result:database};queueMicrotask(()=>request.onsuccess());return request;}},latest:()=>latest,closed:()=>closed};
}

test('AI history saves and deletes resolve only after transaction commit, and aborts reject',async()=>{
  const original=globalThis.indexedDB,fixture=indexedDbFixture();globalThis.indexedDB=fixture.indexedDB;
  try{
    let settled=false;
    const save=db.saveConversation(readChatImport(JSON.stringify(exported()))).then(()=>{settled=true;});
    await new Promise(resolve=>setImmediate(resolve));
    fixture.latest().request.onsuccess?.();await Promise.resolve();assert.equal(settled,false);
    fixture.latest().tx.oncomplete();await save;assert.equal(settled,true);assert.equal(fixture.closed(),1);
    const deletion=db.deleteConversation('existing');const rejected=assert.rejects(deletion,/aborted/);
    await new Promise(resolve=>setImmediate(resolve));fixture.latest().request.onsuccess?.();fixture.latest().tx.onabort();await rejected;assert.equal(fixture.closed(),2);
    const generation=db.saveGeneration({id:'image'});const quota=assert.rejects(generation,/quota/);
    await new Promise(resolve=>setImmediate(resolve));fixture.latest().tx.error=Error('quota');fixture.latest().tx.onerror();await quota;assert.equal(fixture.closed(),3);
  }finally{globalThis.indexedDB=original;}
});

function isolatedChat(saveConversation){
  const state=[],refs=[];let next=0,refNext=0,providerCalls=0;
  const react={useState:initial=>{const index=next++;state[index]=initial;return [initial,value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:value=>{const result={current:value};refs[refNext++]=result;return result;},useCallback:fn=>fn,useEffect:()=>{}};
  const module={};
  const source=readFileSync(new URL('../hooks/ai-studio/useChat.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:module,AbortController,require:name=>{
    if(name==='react')return react;
    if(name.endsWith('/storage/db'))return {...db,saveConversation};
    if(name.endsWith('/storage/import'))return {readChatImport};
    if(name.endsWith('/chat/streamClient'))return {streamChatClient:()=>{providerCalls++;throw Error('Unexpected provider call');}};
    if(name.endsWith('/chat/settings'))return {DEFAULT_SETTINGS:{}};
    if(name.endsWith('/chat/outgoing-request'))return {};
    throw Error('Unexpected import '+name);
  }});
  return {chat:module.useChat('selected:free'),state,providerCalls:()=>providerCalls};
}

test('AI import waits for durable local save, never sends a prompt, and protects existing state on failure',async()=>{
  let finish;const stored=[];
  const fixture=isolatedChat(conversation=>{stored.push(conversation);return new Promise(resolve=>{finish=resolve;});});
  const importing=fixture.chat.importChat(JSON.stringify(exported()));
  assert.equal(fixture.state[0].length,0);assert.equal(fixture.state[1],null);assert.equal(fixture.chat.send('Do not send'),false);
  await assert.rejects(fixture.chat.importChat(JSON.stringify(exported())),/current action/);
  finish();await importing;assert.equal(fixture.state[0].length,1);assert.equal(fixture.state[1],stored[0].id);assert.equal(fixture.state[2][1].content,'A picture');assert.equal(fixture.providerCalls(),0);
  const failed=isolatedChat(()=>Promise.reject(Error('Storage full')));
  await assert.rejects(failed.chat.importChat(JSON.stringify(exported())),/Storage full/);
  assert.equal(failed.state[0].length,0);assert.equal(failed.state[1],null);assert.equal(failed.state[3],false);assert.equal(failed.providerCalls(),0);
});
