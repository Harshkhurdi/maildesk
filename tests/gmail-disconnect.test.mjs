import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

async function disconnectFixture({ownerId='owner',leaseId=null,leaseUntil=Date.now()+60000,savedFiles=[]}={}){
  const row={id:'account',ownerId,leaseId,leaseUntil,token:'encrypted'};
  const accounts={id:'id',ownerId:'ownerId'},mail={id:'id',ownerId:'ownerId',accountId:'accountId'},tasks={id:'id',ownerId:'ownerId',accountId:'accountId'},files={ownerId:'ownerId',taskId:'taskId',mailId:'mailId'};
  const effects=[],fileRows=structuredClone(savedFiles),cachedMail=[{id:'cached-legacy',accountId:'account'}];
  const eq=(field,value)=>record=>record[field]===value,and=(...conditions)=>record=>conditions.every(condition=>condition(record)),or=(...conditions)=>record=>conditions.some(condition=>condition(record));
  const inArray=(field,rows)=>record=>rows.some(value=>value.id===record[field]);
  const like=(field,pattern)=>record=>typeof record[field]==='string'&&record[field].startsWith(pattern.slice(0,-1));
  const db={
    select(){return {from(table){return {where(condition){return (table===accounts?[row]:table===mail?cachedMail:[]).filter(condition);}};}};},
    update(table){return {set(values){return {async where(condition){effects.push({operation:'update',table,values});for(const file of fileRows.filter(condition))Object.assign(file,values);}};}};},
    delete(table){return {async where(){effects.push({operation:'delete',table});}};},
    transaction:callback=>callback(db),
  };
  class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
  const bindings={accounts,mail,tasks,files,eq,and,or,like,inArray,HttpError,guard:async()=>({user:{userId:'owner'},db}),body:request=>request.json(),json:Response.json,failure:error=>Response.json({error:error.message},{status:error.status??500}),decrypt:async()=>({refreshToken:'fixture'}),fetch:async()=>{effects.push({operation:'revoke'});return new Response('',{status:200});}};
  const source=(await readFile(new URL('../app/api/gmail/disconnect/route.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const key='disconnect_fixture_'+crypto.randomUUID().replaceAll('-','');globalThis[key]=bindings;
  let handler;
  try{handler=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${code}`).toString('base64'));}
  finally{delete globalThis[key];}
  return {effects,fileRows,run:()=>handler.POST(new Request('https://maildesk.test/api/gmail/disconnect',{method:'POST',body:JSON.stringify({accountId:'account'})}))};
}

test('refresh cooldown does not prevent the owner from disconnecting Gmail',async()=>{
  const fixture=await disconnectFixture();const response=await fixture.run();
  assert.equal(response.status,200);assert.equal((await response.json()).disconnected,true);
  assert.equal(fixture.effects.filter(effect=>effect.operation==='revoke').length,1);
  assert.equal(fixture.effects.filter(effect=>effect.operation==='delete').length,3);
});
test('an active Gmail refresh still prevents disconnect before provider or database changes',async()=>{
  const fixture=await disconnectFixture({leaseId:'active-refresh'});
  assert.equal((await fixture.run()).status,409);assert.deepEqual(fixture.effects,[]);
});
test('an unowned Gmail account cannot be disconnected during cooldown',async()=>{
  const fixture=await disconnectFixture({ownerId:'another-owner'});
  assert.equal((await fixture.run()).status,404);assert.deepEqual(fixture.effects,[]);
});
test('disconnect unlinks owned files for cached and pruned mail while preserving other owners and accounts',async()=>{
  const savedFiles=[
    {id:'old',ownerId:'owner',mailId:'account:pruned-message'},
    {id:'cached',ownerId:'owner',mailId:'cached-legacy'},
    {id:'foreign-owner',ownerId:'other',mailId:'account:pruned-message'},
    {id:'foreign-account',ownerId:'owner',mailId:'another-account:message'},
    {id:'similar-prefix',ownerId:'owner',mailId:'account-other:message'},
  ];
  const fixture=await disconnectFixture({savedFiles});assert.equal((await fixture.run()).status,200);
  assert.equal(fixture.fileRows[0].mailId,null);assert.equal(fixture.fileRows[1].mailId,null);
  assert.deepEqual(fixture.fileRows.slice(2),savedFiles.slice(2));
});
