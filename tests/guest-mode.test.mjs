import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {z} from 'zod';
import React from 'react';
import * as icons from 'lucide-react';
import {merchantUrl,publicWebUrl} from '../lib/web-links.ts';
import {safeUrl} from '../lib/task-rules.ts';
import {validateFileContent} from '../lib/file-content.ts';
async function isolated(path,bindings){
 const source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const code=ts.transpileModule(source,{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const key='guest_fixture_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=bindings;
 try{return await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));}finally{delete globalThis[key];}
}
const {validateUtility}=await isolated('../lib/utility-schema.ts',{z,merchantUrl,publicWebUrl});
const guest=await isolated('../lib/guest-store.ts',{z,validateUtility,validateFileContent,safeUrl});
function memory(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
const timestamp='2026-10-15T12:00:00.000Z';
const task={id:'guest-task',title:'My guest task',status:'pending',priority:'normal',due:null,category:'personal',notes:'Local only',taskUrl:null,snoozedUntil:null,accountId:null,threadId:null,sourceId:null,evidence:'',reason:'Guest',sourceChanged:0,createdAt:timestamp,updatedAt:timestamp};
const file={id:'draft:guest',title:'Guest document',kind:'document',content:'{"html":"<p>Guest text</p>"}',taskId:task.id,mailId:null,revision:0,createdAt:timestamp,updatedAt:timestamp};
test('a new guest workspace has no account, private data or configured integration',()=>{
 const workspace=guest.guestWorkspace(guest.readGuestData(memory()));assert.deepEqual(workspace,{accounts:[],tasks:[],files:[],mailCount:0,configured:false,callbackUrl:'',userName:'Guest'});
});
test('guest tasks and linked documents survive a fresh storage read',()=>{
 const storage=memory();guest.saveGuestTask(storage,task);const saved=guest.saveGuestFile(storage,file);
 assert(!saved.file.id.startsWith('draft:'));assert.equal(saved.file.revision,1);
 const restored=guest.guestWorkspace(guest.readGuestData(storage));assert.equal(restored.tasks[0].title,task.title);assert.equal(restored.files[0].taskId,task.id);assert.equal(restored.files[0].content,file.content);
});
test('stale file saves are rejected without replacing the newer copy',()=>{
 const storage=memory();guest.saveGuestTask(storage,task);const first=guest.saveGuestFile(storage,file).file;
 guest.saveGuestFile(storage,{...first,title:'Newer copy'});const before=storage.getItem(guest.GUEST_STORAGE_KEY);
 assert.throws(()=>guest.saveGuestFile(storage,{...first,title:'Stale overwrite'}),/another tab/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),before);
 guest.removeGuestFile(storage,first.id);assert.throws(()=>guest.saveGuestFile(storage,first),/another tab/);
});
test('guest storage rejects real-mail links, executable URLs and unsupported office content',()=>{
 const storage=memory();guest.saveGuestTask(storage,task);const before=storage.getItem(guest.GUEST_STORAGE_KEY);
 for(const changed of [{...task,accountId:'private-account'},{...task,taskUrl:'javascript:alert(1)'}])assert.throws(()=>guest.saveGuestTask(storage,changed));
 assert.throws(()=>guest.saveGuestFile(storage,{...file,content:'invalid JSON'}));assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),before);
});
test('corrupt guest data is preserved and cannot be silently overwritten',()=>{
 const storage=memory();storage.setItem(guest.GUEST_STORAGE_KEY,'broken saved data');assert.throws(()=>guest.readGuestData(storage),/kept in this browser/);assert.throws(()=>guest.saveGuestTask(storage,task));assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),'broken saved data');
});
test('guest storage reports quota failures and enforces a bounded total size',()=>{
 const storage=memory();const blocked={getItem:storage.getItem,setItem(){throw new DOMException('quota','QuotaExceededError');}};
 assert.throws(()=>guest.saveGuestTask(blocked,task),/full or blocked/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),null);
 const data=guest.emptyGuestData();data.files=Array.from({length:5},(_,i)=>({...file,id:'file-'+i,taskId:null,revision:1,content:JSON.stringify({html:'x'.repeat(499000)})}));assert.throws(()=>guest.writeGuestData(storage,data),/storage is full/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),null);
});
test('guest tool saves use local storage, preserve revisions and never call fetch',async()=>{
 const storage=memory(),api=guest.createGuestUtilityApi(storage),original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Guest must not call a server');};
 try{
 const {item}=await api('/api/utilities','POST',{kind:'code',title:'Guest code',content:JSON.stringify({files:[{name:'index.html',content:'<h1>Local</h1>'}]})});
 assert.equal((await api('/api/utilities?kind=code')).items[0].id,item.id);
 await api('/api/utilities','POST',{...item,title:'Edited guest code'});
 await assert.rejects(api('/api/utilities','POST',{...item,title:'Stale edit'}),/another tab/);
 assert.equal((await api('/api/utilities?kind=code')).items[0].title,'Edited guest code');
 await assert.rejects(api('/api/gmail/connect','POST',{}),/Sign in/);await assert.rejects(api('https://evil.example/api/utilities?kind=code'),/Sign in/);
 await api('/api/utilities','DELETE',{id:item.id});assert.equal((await api('/api/utilities?kind=code')).items.length,0);
 }finally{globalThis.fetch=original;}
});
test('guest bookmarks stay active while removed shopping data remains safe in backups',async()=>{
 const storage=memory(),api=guest.createGuestUtilityApi(storage);
 await api('/api/utilities','POST',{kind:'web',title:'Example',content:'{"url":"https://example.com/"}'});
 const data=guest.readGuestData(storage);data.utilities.push({id:'legacy-shopping',kind:'shopping',title:'Saved shopping',content:JSON.stringify({address:'Synthetic test address',pincode:'110001',quotes:[]}),revision:1,updatedAt:timestamp});guest.writeGuestData(storage,data);
 const before=storage.getItem(guest.GUEST_STORAGE_KEY);await assert.rejects(api('/api/utilities?kind=shopping'),/removed/);await assert.rejects(api('/api/utilities','POST',{kind:'shopping',title:'Shopping',content:'{}'}),/removed/);
 await assert.rejects(api('/api/utilities','POST',{kind:'web',title:'Unsafe',content:'{"url":"javascript:alert(1)"}'}));assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),before);
 const destination=memory();guest.restoreGuestBackup(destination,guest.prepareGuestRestore(destination,before));assert.equal(guest.readGuestData(destination).utilities.find(i=>i.kind==='shopping').id,'legacy-shopping');assert.equal((await api('/api/utilities?kind=web')).items.length,1);
});
test('guest backups retain only guest records and discard injected account metadata',()=>{
 const storage=memory();storage.setItem(guest.GUEST_STORAGE_KEY,JSON.stringify({...guest.emptyGuestData(),accounts:[{token:'private-token'}],userName:'Owner',configured:true}));
 guest.writeGuestData(storage,guest.readGuestData(storage));assert(!storage.getItem(guest.GUEST_STORAGE_KEY).includes('private-token'));assert.equal(guest.guestWorkspace(guest.readGuestData(storage)).userName,'Guest');
});
test('mounting guest mode does not fetch the signed-in workspace even when a session exists',async()=>{
 const effects=[],storage=memory();let requests=0,loaded;
 const module=await isolated('../components/maildesk-workspace.tsx',{...Object.fromEntries(Object.entries(icons).filter(([key])=>key!=="default"&&/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key))),React,dynamic:()=>()=>null,useState:value=>[typeof value==='function'?value():value,next=>{if(next?.userName==='Guest')loaded=next;}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),window:{localStorage:storage,addEventListener(){},removeEventListener(){}},location:{search:'',pathname:'/guest'},history:{replaceState(){}},fetch:()=>{requests++;throw Error('Private request forbidden');},...guest,cleanHtml:value=>value});
 module.default({guest:true});for(const effect of effects)effect();await Promise.resolve();await Promise.resolve();assert.equal(requests,0);assert.equal(loaded.userName,'Guest');assert.deepEqual(loaded.tasks,[]);
});
test('guest backup restore adds records, preserves existing work and skips identical records',async()=>{
 const source=memory();guest.saveGuestTask(source,task);guest.saveGuestFile(source,file);
 await guest.createGuestUtilityApi(source)('/api/utilities','POST',{kind:'web',title:'Example',content:'{"url":"https://example.com/"}'});
 const destination=memory();guest.saveGuestTask(destination,{...task,id:'other',title:'Keep my work'});
 const plan=guest.prepareGuestRestore(destination,source.getItem(guest.GUEST_STORAGE_KEY));
 assert.deepEqual(plan.counts,{tasks:1,files:1,utilities:1,skipped:0});assert.equal(guest.readGuestData(destination).tasks.length,1);
 guest.restoreGuestBackup(destination,plan);const restored=guest.readGuestData(destination);
 assert.equal(restored.tasks.length,2);assert.equal(restored.files[0].taskId,task.id);assert.equal(restored.utilities.length,1);
 const repeated=guest.prepareGuestRestore(destination,source.getItem(guest.GUEST_STORAGE_KEY));assert.deepEqual(repeated.counts,{tasks:0,files:0,utilities:0,skipped:3});
});
test('changed colliding task and file backups become separate copies with imported task links intact',()=>{
 const source=memory();guest.saveGuestTask(source,task);guest.saveGuestFile(source,file);const raw=source.getItem(guest.GUEST_STORAGE_KEY);
 const destination=memory();guest.writeGuestData(destination,guest.readGuestData(source));
 guest.saveGuestTask(destination,{...task,title:'Newer task'});
 const original=guest.readGuestData(destination).files[0];guest.saveGuestFile(destination,{...original,title:'Newer document'});
 const restored=guest.restoreGuestBackup(destination,guest.prepareGuestRestore(destination,raw));
 assert.equal(restored.tasks.length,2);assert.equal(restored.files.length,2);
 assert.equal(restored.tasks.find(t=>t.id===task.id).title,'Newer task');assert.equal(restored.files.find(f=>f.id===original.id).title,'Newer document');
 const imported=restored.tasks.find(t=>t.id!==task.id),importedFile=restored.files.find(f=>f.id!==original.id);assert.equal(importedFile.taskId,imported.id);assert.equal(importedFile.title,file.title);
});
test('invalid, oversized, disconnected, or capacity-exceeding guest backups never change saved data',()=>{
 const storage=memory();guest.saveGuestTask(storage,task);const before=storage.getItem(guest.GUEST_STORAGE_KEY);
 for(const raw of ['bad json',JSON.stringify({...guest.emptyGuestData(),version:2}),'x'.repeat(2_000_001),JSON.stringify({...guest.emptyGuestData(),files:[{...file,id:'saved',revision:1}]})])assert.throws(()=>guest.prepareGuestRestore(storage,raw));
 const full=guest.emptyGuestData();full.tasks=Array.from({length:500},(_,i)=>({...task,id:'full-'+i}));guest.writeGuestData(storage,full);const fullRaw=storage.getItem(guest.GUEST_STORAGE_KEY);
 assert.throws(()=>guest.prepareGuestRestore(storage,before),/exceed/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),fullRaw);
});
test('guest restore detects changes after review and handles quota failure without data loss',()=>{
 const storage=memory(),raw=JSON.stringify({...guest.emptyGuestData(),tasks:[task]});const plan=guest.prepareGuestRestore(storage,raw);
 guest.saveGuestTask(storage,{...task,id:'new',title:'New work in another tab'});const before=storage.getItem(guest.GUEST_STORAGE_KEY);
 assert.throws(()=>guest.restoreGuestBackup(storage,plan),/another tab/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),before);
 const blocked={getItem:storage.getItem,setItem(){throw Error('quota');}};
 assert.throws(()=>guest.restoreGuestBackup(blocked,guest.prepareGuestRestore(blocked,raw)),/full or blocked/);assert.equal(storage.getItem(guest.GUEST_STORAGE_KEY),before);
});
test('manual mail refresh makes one request per account even when a legacy response says incomplete',async()=>{
 const workspace={accounts:[{id:'a',email:'a@example.com'},{id:'b',email:'b@example.com'}],tasks:[],files:[],mailCount:0,configured:true,callbackUrl:'',userName:'Owner'};
 const requests=[];let stateIndex=0;
 const module=await isolated('../components/maildesk-workspace.tsx',{...Object.fromEntries(Object.entries(icons).filter(([key])=>key!=="default"&&/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key))),React,dynamic:()=>()=>null,useState:value=>[stateIndex++===0?workspace:typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:()=>{},fetch:async(path,options)=>{requests.push({path,body:options.body?JSON.parse(options.body):undefined});return Response.json(path==='/api/workspace'?workspace:{done:false,processed:25});},...guest,cleanHtml:value=>value});
 const tree=module.default();function find(element){if(!element||typeof element!=='object')return;const children=[element.props?.children].flat(Infinity);if(element.type==='button'&&children.includes('Refresh mail'))return element;for(const child of children){const result=find(child);if(result)return result;}}
 const refresh=find(tree);assert(refresh);refresh.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests.filter(r=>r.path==='/api/gmail/sync').map(r=>r.body.accountId),['a','b']);assert.equal(requests.filter(r=>r.path==='/api/workspace').length,2);
});
