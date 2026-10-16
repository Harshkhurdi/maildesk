import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const accounts=Object.fromEntries(['id','ownerId','email','phase','scanned','total','syncedAt','error'].map(key=>[key,key])),mail={ownerId:'ownerId',accountId:'accountId',receivedAt:'receivedAt',gmailId:'gmailId'},tasks={ownerId:'ownerId',updatedAt:'updatedAt'},files={ownerId:'ownerId',updatedAt:'updatedAt'};
const eq=(field,value)=>row=>row[field]===value,and=(...conditions)=>row=>conditions.filter(Boolean).every(condition=>condition(row)),desc=field=>field,count=()=>Symbol.for('count');
const accountRows=[{id:'a',ownerId:'owner',scanned:40},{id:'b',ownerId:'owner',scanned:40},{id:'foreign',ownerId:'other',scanned:40}];
const mailRows=accountRows.flatMap(a=>Array.from({length:40},(_,i)=>({id:`${a.id}:m${i}`,ownerId:a.ownerId,accountId:a.id,gmailId:`m${i}`,threadId:`t${i}`,receivedAt:new Date(Date.UTC(2026,8,1+i)).toISOString(),subject:i===0?'Legacy target':'Recent '+i,sender:'sender@test.example',body:'Plain text'})));
function fixture(){
 let reads=0;const records=new Map([[accounts,accountRows],[mail,mailRows],[tasks,[{id:'saved-old-task',ownerId:'owner',status:'pending',updatedAt:'2026-10-16'}]],[files,[]]]);
 const db={select(projection){reads++;let table,condition=()=>true,order=[];const result=()=>{let rows=(records.get(table)??[]).filter(condition);if(order.length)rows=[...rows].sort((a,b)=>{for(const field of order){const diff=String(b[field]??'').localeCompare(String(a[field]??''));if(diff)return diff;}return 0;});if(projection&&Object.values(projection).some(v=>v===Symbol.for('count')))return [{n:rows.length}];return projection?rows.map(row=>Object.fromEntries(Object.entries(projection).map(([key,field])=>[key,row[field]]))):rows;};const query={from(value){table=value;return query;},where(value){condition=value;return query;},orderBy(...value){order=value;return query;},limit(value){return result().slice(0,value);},groupBy(field){const groups=new Map();for(const row of (records.get(table)??[]).filter(condition))groups.set(row[field],(groups.get(row[field])??0)+1);return [...groups].map(([accountId,n])=>({accountId,n}));},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return query;}};
 return {db,reads:()=>reads};
}
async function route(path,deny=false){
 const f=fixture(),source=(await readFile(new URL(path,import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 const key='recent_api_'+crypto.randomUUID().replaceAll('-','');globalThis[key]={accounts,mail,tasks,files,eq,and,desc,count,guard:async()=>{if(deny)throw Object.assign(Error('Sign in'),{status:401});return {user:{userId:'owner',displayName:'Owner'},db:f.db};},json:Response.json,failure:e=>Response.json({error:e.message},{status:e.status??500}),ready:()=>true,config:()=>({origin:'https://maildesk.test'})};
 try{const handler=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(globalThis[key]).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));return {...f,handler};}finally{delete globalThis[key];}
}
const request=query=>new Request('https://maildesk.test/api/mail'+query);
test('mail reads return at most25 newest messages per owned account even with legacy caches',async()=>{
 const {handler}=await route('../app/api/mail/route.ts');const data=await (await handler.GET(request(''))).json();
 assert.equal(data.total,50);assert.equal(data.mail.filter(m=>m.accountId==='a').length,25);assert.equal(data.mail.filter(m=>m.accountId==='b').length,25);
 assert(!data.mail.some(m=>m.accountId==='foreign'||m.id==='a:m0'||'ownerId'in m));assert(data.mail.some(m=>m.id==='a:m39'));assert.equal(data.hasMore,false);
});
test('search and source lookups never reopen messages outside the recent25 window',async()=>{
 const {handler}=await route('../app/api/mail/route.ts');
 for(const query of ['?q=Legacy%20target','?id=a%3Am0','?thread=t0','?account=foreign'])assert.equal((await (await handler.GET(request(query))).json()).total,0,query);
 const selected=await (await handler.GET(request('?account=a&q=Recent'))).json();assert.equal(selected.total,25);assert(selected.mail.every(m=>m.accountId==='a'));
});
test('workspace counts cap legacy mail per account and keep previously saved tasks',async()=>{
 const {handler}=await route('../app/api/workspace/route.ts');const data=await (await handler.GET()).json();assert.equal(data.mailCount,50);assert(data.accounts.every(a=>a.scanned===25));assert.equal(data.tasks[0].id,'saved-old-task');assert.equal(data.tasks[0].status,'pending');
});
test('recent-mail reads require authentication before database access',async()=>{
 for(const path of ['../app/api/mail/route.ts','../app/api/workspace/route.ts']){const {handler,reads}=await route(path,true);assert.equal((await handler.GET(request(''))).status,401);assert.equal(reads(),0);}
});
