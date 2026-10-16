import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const list=(id,address,pincode,product)=>({id,revision:3,title:'Shopping list',updatedAt:'2026-10-16T10:00:00Z',content:JSON.stringify({address,pincode,quotes:[{id:'quote-'+id,product,merchant:'blinkit',url:'https://blinkit.com/prn/test',pack:'1 litre',price:60,delivery:10,quantity:1,checkedAt:'2026-10-16T10:00:00Z',location:pincode}]})});
const fixtures=[list('existing','Existing address','110001','Existing milk'),list('restored','Restored address','400001','Restored milk')];

function shopping(){
  const state=[],effects=[],writes=[];let cursor=0,allowDiscard=false,prompts=0,pendingSave;
  const react={useState:initial=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useEffect:fn=>{effects.push(fn);}};
  const api=async(path,method,payload)=>{
    if(!method)return {items:fixtures};
    writes.push(payload);return new Promise(resolve=>{pendingSave=()=>resolve({item:{...fixtures.find(row=>row.id===payload.id),...payload,revision:payload.revision+1}});});
  };
  const jsx=(type,props)=>({type,props});const exported={};
  const source=readFileSync(new URL('../components/shopping-workspace.tsx',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports:exported,confirm:()=>{prompts++;return allowDiscard;},window:{addEventListener(){},removeEventListener(){}},require:name=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='lucide-react')return {};
    if(name.endsWith('/utility-client'))return {utilityApi:api,saveDownload(){}};
    if(name.endsWith('/guest-store'))return {guestUtilityApi:api};
    if(name.endsWith('/web-links'))return {merchants:[{id:'blinkit',name:'Blinkit'}],merchantUrl:url=>url};
    throw Error('Unexpected dependency '+name);
  }});
  const render=()=>{cursor=0;effects.length=0;return exported.default({guest:true});};
  const find=(node,predicate)=>{
    if(!node||typeof node!=='object')return;
    if(predicate(node))return node;
    for(const child of [node.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}
  };
  return {render,load:async()=>{render();for(const effect of effects)effect();await new Promise(resolve=>setImmediate(resolve));},label:(tree,label)=>find(tree,node=>node.props?.['aria-label']===label),button:(tree,text)=>find(tree,node=>node.type==='button'&&[node.props?.children].flat().includes(text)),input:(tree,placeholder)=>find(tree,node=>node.props?.placeholder===placeholder),allowDiscard:value=>{allowDiscard=value;},prompts:()=>prompts,writes,finishSave:()=>pendingSave()};
}

test('restored shopping lists can be selected and subsequent saves preserve the chosen identity and revision',async()=>{
  const app=shopping();await app.load();let tree=app.render();
  assert.equal(app.label(tree,'Open saved shopping list').props.children.length,2);
  assert.equal(app.label(tree,'Delivery address').props.value,'Existing address');
  app.label(tree,'Open saved shopping list').props.onChange({target:{value:'restored'}});tree=app.render();
  assert.equal(app.label(tree,'Delivery address').props.value,'Restored address');assert.equal(app.label(tree,'PIN code').props.value,'400001');
  assert.ok(app.label(tree,'Remove price for Restored milk'));
  app.label(tree,'Delivery address').props.onChange({target:{value:'Edited restored address'}});tree=app.render();
  app.button(tree,'Save address').props.onClick();tree=app.render();
  assert.equal(app.label(tree,'Open saved shopping list').props.disabled,true);
  app.label(tree,'Open saved shopping list').props.onChange({target:{value:'existing'}});assert.equal(app.label(app.render(),'Delivery address').props.value,'Edited restored address');
  assert.equal(app.writes[0].id,'restored');assert.equal(app.writes[0].revision,3);
  assert.equal(JSON.parse(app.writes[0].content).quotes[0].product,'Restored milk');
  app.finishSave();await new Promise(resolve=>setImmediate(resolve));tree=app.render();
  app.button(tree,'Save address').props.onClick();assert.equal(app.writes[1].revision,4);app.finishSave();await new Promise(resolve=>setImmediate(resolve));
  tree=app.render();app.label(tree,'Open saved shopping list').props.onChange({target:{value:'existing'}});tree=app.render();
  assert.equal(app.label(tree,'Delivery address').props.value,'Existing address');
});

test('switching shopping lists protects unsaved address and price drafts until discard is confirmed',async()=>{
  const app=shopping();await app.load();let tree=app.render();
  app.label(tree,'Delivery address').props.onChange({target:{value:'Unsaved address'}});tree=app.render();
  app.label(tree,'Open saved shopping list').props.onChange({target:{value:'restored'}});tree=app.render();
  assert.equal(app.label(tree,'Delivery address').props.value,'Unsaved address');assert.equal(app.label(tree,'Open saved shopping list').props.value,'existing');
  app.allowDiscard(true);app.label(tree,'Open saved shopping list').props.onChange({target:{value:'restored'}});tree=app.render();
  assert.equal(app.label(tree,'Delivery address').props.value,'Restored address');
  app.input(tree,'Brand and product').props.onChange({target:{value:'Unsaved quote'}});tree=app.render();
  app.allowDiscard(false);app.label(tree,'Open saved shopping list').props.onChange({target:{value:'existing'}});tree=app.render();
  assert.equal(app.input(tree,'Brand and product').props.value,'Unsaved quote');assert.equal(app.label(tree,'Open saved shopping list').props.value,'restored');
  app.allowDiscard(true);app.label(tree,'Open saved shopping list').props.onChange({target:{value:'existing'}});tree=app.render();
  assert.equal(app.input(tree,'Brand and product').props.value,'');assert.equal(app.prompts(),4);assert.equal(app.writes.length,0);
});
