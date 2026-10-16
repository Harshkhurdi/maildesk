import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
test('sending while a peer message is waiting never skips the incoming message in the next poll',async()=>{
  const source=await readFile(new URL('../components/conversation-hub.tsx',import.meta.url),'utf8');
  const body=source.match(/^ function merge\(.*$/m)[0].trim();
  const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const after={current:10},messageList={current:null},skipScroll={current:false};let messages=[{id:10}];
  const merge=new Function('after','messageList','skipScroll','setMessages',js+'; return merge;')(after,messageList,skipScroll,fn=>{messages=fn(messages);});
  const sendBody=source.match(/^ async function send\(.*$/m)[0];assert.match(sendBody,/merge\(\[d\.message\],false\)/);
  merge([{id:12}],false);assert.equal(after.current,10);
  const serverMessages=[{id:11},{id:12}];merge(serverMessages.filter(row=>row.id>after.current));
  assert.deepEqual(messages.map(m=>m.id),[10,11,12]);assert.equal(after.current,12);
});
