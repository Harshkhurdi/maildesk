import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {MAX_REQUEST_CHARACTERS,MAX_REQUEST_BYTES,requestFitsLimits} from '../lib/request-limits.ts';

const resolver=registerHooks({resolve(specifier,context,next){
  try{return next(specifier,context);}catch(error){
    if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);
    throw error;
  }
}});
const {conversationChatRequest,outgoingChatRequest,serializeChatRequest}=await import('../lib/ai-studio/chat/outgoing-request.ts');
resolver.deregister();
const settings={systemPrompt:'',temperature:0.7,maxTokens:4096,jsonMode:false};
const attachment=(bytes=500*1024)=>({kind:'image',name:'image.png',url:'data:image/png;base64,'+Buffer.alloc(bytes).toString('base64')});
const message=(content,attachments)=>({id:'user',role:'user',content,attachments,createdAt:1});

// Run the real Composer event handler with minimal hook/element adapters. This
// exercises its clear-on-accept behavior without a browser or another library.
function composerDraft(text,attachments,onSubmit){
  const states=[];
  let stateIndex=0;
  const react={
    forwardRef:render=>render,
    useRef:value=>({current:value}),
    useImperativeHandle:()=>{},
    useState:initial=>{
      const index=stateIndex++;
      states[index]=index===0?attachments:initial;
      return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];
    },
  };
  const jsx=(type,props)=>({type,props});
  const exported={};
  const source=readFileSync(new URL('../components/ai-studio/Composer.tsx',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,{exports:exported,require:name=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    throw Error('Unexpected Composer dependency: '+name);
  }});
  const tree=exported.Composer({visionReady:true,onSubmit},null);
  function find(node,label){
    if(!node||typeof node!=='object')return null;
    if(node.props?.['aria-label']===label)return node;
    const children=node.props?.children;
    for(const child of Array.isArray(children)?children:[children]){const match=find(child,label);if(match)return match;}
    return null;
  }
  const textarea=find(tree,'AI message'),send=find(tree,'Send message');
  const input={value:text,style:{},scrollHeight:40};
  textarea.props.ref.current=input;
  return {send:()=>send.props.onClick(),text:()=>input.value,attachments:()=>states[0]};
}

test('request limits include both serialized characters and UTF-8 bytes',()=>{
  assert.equal(requestFitsLimits('a'.repeat(MAX_REQUEST_CHARACTERS)),true);
  assert.equal(requestFitsLimits('a'.repeat(MAX_REQUEST_CHARACTERS+1)),false);
  assert.equal(requestFitsLimits('界'.repeat(Math.floor(MAX_REQUEST_BYTES/3))),true);
  assert.equal(requestFitsLimits('界'.repeat(Math.floor(MAX_REQUEST_BYTES/3)+1)),false);
});

test('a valid pair of individually allowed attachments is rejected without clearing the actual Composer draft',()=>{
  const files=[attachment(),attachment()];
  let error='';
  const draft=composerDraft('Please read both images',files,(text,attachments)=>{
    try{serializeChatRequest(conversationChatRequest('test:free',[message(text,attachments)],settings));return true;}
    catch(reason){error=reason.message;return false;}
  });
  draft.send();
  assert.match(error,/Remove attachments/);
  assert.equal(draft.text(),'Please read both images');
  assert.equal(draft.attachments(),files);
});

test('accepted sends clear the actual Composer only after its callback accepts',()=>{
  const files=[attachment(20)];
  let submitted;
  const draft=composerDraft('Please read this image',files,(text,attachments)=>{
    submitted=serializeChatRequest(conversationChatRequest('test:free',[message(text,attachments)],settings));
    return true;
  });
  draft.send();
  assert.ok(submitted.includes('Please read this image'));
  assert.equal(draft.text(),'');
  assert.deepEqual(Array.from(draft.attachments()),[]);
});

test('cumulative historical attachments and assistant text are budgeted without modifying or silently trimming history',()=>{
  const history=[message('Earlier image',[attachment()]),...Array.from({length:5},(_,index)=>({id:String(index),role:'assistant',content:'x'.repeat(90000),createdAt:index+2}))];
  const before=JSON.stringify(history);
  assert.throws(()=>serializeChatRequest(conversationChatRequest('test:free',[...history,message('Continue')],settings)),/start a new chat or edit an earlier message/);
  assert.equal(JSON.stringify(history),before);
  const edited=history.map((entry,index)=>index===0?{...entry,attachments:[]}:entry);
  assert.doesNotThrow(()=>serializeChatRequest(conversationChatRequest('test:free',[...edited,message('Continue')],settings)));
});

test('retry after removing an attachment keeps the original message and fits the request',()=>{
  const files=[attachment(),attachment()],text='Original draft';
  assert.throws(()=>serializeChatRequest(conversationChatRequest('test:free',[message(text,files)],settings)),/request limit/);
  const serialized=serializeChatRequest(conversationChatRequest('test:free',[message(text,files.slice(0,1))],settings));
  const payload=JSON.parse(serialized);
  assert.equal(payload.messages[0].content[0].text,text);
  assert.equal(payload.messages[0].content.length,2);
  assert.equal(files.length,2);
});

test('system instructions count toward message and size limits',()=>{
  const history=Array.from({length:100},()=>message('hello'));
  assert.doesNotThrow(()=>serializeChatRequest(conversationChatRequest('test:free',history,settings)));
  assert.throws(()=>serializeChatRequest(conversationChatRequest('test:free',history,{...settings,systemPrompt:'Be concise'})),/100-message/);
  assert.throws(()=>serializeChatRequest(conversationChatRequest('test:free',[message('hello')],{...settings,systemPrompt:'x'.repeat(100001)})),/100,000 characters/);
});

test('preflight and network payload serialization use identical fields and include settings',()=>{
  const payload=conversationChatRequest('test:free',[message('hello')],{...settings,systemPrompt:'Be concise',jsonMode:true});
  const exact=serializeChatRequest({...payload,signal:'ignored',onDelta:()=>{}});
  assert.equal(exact,JSON.stringify(outgoingChatRequest(payload)));
  assert.equal(JSON.parse(exact).messages[0].role,'system');
  assert.equal(JSON.parse(exact).jsonMode,true);
  assert.equal(JSON.parse(exact).maxTokens,4096);
  assert.equal(exact.includes('signal'),false);
});
