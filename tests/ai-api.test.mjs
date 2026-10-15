import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';let checks=0;
async function api(profile,path,method='GET',body,expected=200,requestOrigin=origin){const res=await fetch(origin+path,{method,headers:{cookie:`__sites_local_auth=${profile}`,origin:requestOrigin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={error:text};}assert.equal(res.status,expected,`${path}: ${JSON.stringify(data)}`);checks++;return data;}
for(const profile of [0,2])for(const path of ['/api/ai/models','/api/ai/images','/api/ai/chat'])await api(profile,path,path.endsWith('chat')?'POST':'GET',path.endsWith('chat')?{}:undefined,profile===0?401:403);
const valid={model:'test:free',messages:[{role:'user',content:'Test'}]};
await api(1,'/api/ai/chat','POST',valid,403,'https://evil.example');
await api(1,'/api/ai/chat','POST',{...valid,model:'paid/model'},400);
await api(1,'/api/ai/chat','POST',{...valid,model:'test:free:online'},400);
await api(1,'/api/ai/chat','POST',{...valid,plugins:[{id:'web'}]},400);
await api(1,'/api/ai/chat','POST',{...valid,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'https://private.example/image.png'}}]}]},400);
await api(1,'/api/ai/images','POST',{model:'paid/image',prompt:'test'},400);
const models=await api(1,'/api/ai/models');assert(models.models.length>0);assert(models.models.every(m=>m.id==='openrouter/free'||m.id.endsWith(':free')));checks+=2;
const images=await api(1,'/api/ai/images');assert(images.models.every(m=>m.id.endsWith(':free')));checks++;
console.log(`${checks} AI API checks passed. ${models.models.length} free chat models; ${images.models.length} verified free image models; key configured: ${models.configured}. No generation requested.`);
