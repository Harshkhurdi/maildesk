import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { apps } from '../components/suite-api.ts';
import { safeUrl } from '../lib/safe-url.ts';
import { parseCsv } from '../lib/csv.ts';
test('the application registry contains exactly the five requested products',()=>{assert.deepEqual(apps.map(app=>app.name),['Word','Excel','PowerPoint','Outlook','Free AI Studio']);});
test('retired application and API routes cannot be built or invoked',async()=>{for(const path of ['app/maildesk-qa-fixture','app/__suite_qa','app/code','app/web','app/conversations','app/api/conversations','app/api/tasks','app/api/utilities','app/api/gmail/sync'])await assert.rejects(access(new URL('../'+path,import.meta.url)),{code:'ENOENT'});});
test('calling and code execution dependencies are removed and no retired table is dropped',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert(!Object.keys(pkg.dependencies).some(name=>/codemirror|webrtc|turn/i.test(name)));
  const files=await readdir(new URL('../db/migrations/',import.meta.url));for(const file of files.filter(name=>name.endsWith('.sql')&&!name.startsWith('0000_'))){const sql=await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8');assert(!/\b(DROP|DELETE|TRUNCATE)\b/i.test(sql));}
});
test('CSV parsing preserves commas, quotes and newlines and rejects malformed input',()=>{assert.deepEqual(parseCsv('"Item, one","a""b"\r\n"two\nlines",2'),[['Item, one','a"b'],['two\nlines','2']]);assert.throws(()=>parseCsv('"unclosed,2'));});
test('PDF and email links accept only HTTP(S) URLs',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('data:text/html,test'),null);assert.equal(safeUrl('https://example.test/path'),'https://example.test/path');});
