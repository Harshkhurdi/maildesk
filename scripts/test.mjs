import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Inherited Sites API scripts require a different fixture application. Keep
// deterministic tests separate so npm test never calls a running workspace.
const legacy=new Set(['api.test.mjs','ai-api.test.mjs','conversations-api.test.mjs','utilities-api.test.mjs','pdf-access.test.mjs']);
const tests=readdirSync(new URL('../tests/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')&&!legacy.has(name)).sort().map(name=>'tests/'+name);
const result=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',cwd:new URL('../',import.meta.url)});
process.exit(result.status??1);
