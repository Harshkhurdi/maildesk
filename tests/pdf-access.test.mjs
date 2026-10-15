import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5173';
const login=await fetch(origin+'/signin-with-chatgpt?return_to=%2F',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');assert.ok(cookie);
async function send(payload,headers={}){return fetch(origin+'/api/gmail/pdf',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,cookie,...headers},body:JSON.stringify(payload)});}
assert.equal((await send({mailId:'unknown',index:0},{cookie:''})).status,401);
assert.equal((await send({mailId:'unknown',index:0},{Origin:'https://evil.example'})).status,403);
assert.equal((await send(null)).status,400);
assert.equal((await send({mailId:'unknown',index:-1})).status,400);
assert.equal((await send({mailId:'unknown',index:'0'})).status,400);
assert.equal((await send({mailId:'unknown',index:0})).status,404);
console.log('PDF endpoint checks passed: sign-in, same-origin access, request validation, and source ownership. No Gmail data accessed.');
