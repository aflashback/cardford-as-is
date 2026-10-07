// One bounded loopback test binary, actual service APIs and numeric React UI.
// No production constructor, catalogue, PostgreSQL lifecycle or engine injection.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runBoundedNative} from '../../../../scripts/bounded-native-run.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));process.chdir(root);
if(process.platform!=='win32')throw Error('Native Windows required');
const database=new URL(process.env.TEST_DATABASE_URL??'');
if(database.hostname!=='127.0.0.1'||database.port!=='54331'||database.pathname!=='/cardford_windows_test')throw Error('Isolated native test database required');
const require=createRequire(resolve(root,'web/package.json'));const pg=require('pg');
const started=performance.now(),deadline=started+170000;
const output=resolve('.local',`m06-token-browser-${new Date().toISOString().replaceAll(/[:.]/g,'-')}`);mkdirSync(output,{recursive:true});
const ready=resolve(output,'ready.json'),binary=resolve('.local/m06-token-browser-host.exe'),assets=resolve('.local/m06-token-ui');
const nonce=randomBytes(24).toString('hex');const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const redact=value=>String(value).replaceAll(decodeURIComponent(database.password),'[redacted]');
const steps=[];let host,origin,passed=false,log='',beforeSchemas=[];
const db=new pg.Client({connectionString:database.href,connectionTimeoutMillis:5000,query_timeout:5000,options:'-c statement_timeout=5000 -c lock_timeout=1000'});
const sources=['server/internal/service/token_browser_fixture_test.go','server/internal/service/preparation.go','server/internal/service/token_conformance_test.go','server/internal/conformance/token.go','server/internal/conformance/token_session.go','server/internal/sessions/installation.go','server/internal/sessions/installation_cards.go','server/internal/records/service_codec.go','server/internal/records/service_installation.go','web/conformance-token/index.html','web/conformance-token/main.tsx','web/conformance-token/vite.config.ts','web/src/api/tokenConformance.ts','web/e2e/token-conformance.spec.ts','web/playwright.m06.config.ts','qa/implementation/multi-game/m06/browser-smoke.mjs'];
const sourceBefore=sources.map(path=>({path,sha256:sha(readFileSync(path))}));
const schemas=async()=>((await db.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'm03_service_%' ORDER BY nspname")).rows.map(row=>row.nspname));
async function bounded(promise,milliseconds,name){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${name} deadline; pending/unverified`)),milliseconds);})]);}finally{clearTimeout(timer);}}
async function run(name,args,milliseconds=45000){const result=await runBoundedNative(process.execPath,args,{cwd:root,env:process.env,milliseconds:Math.min(milliseconds,deadline-performance.now()-10000),maxBytes:4<<20});writeFileSync(resolve(output,`${name}.log`),redact(result.output));steps.push({name,args,exitCode:result.exitCode,status:result.status,elapsedMs:result.elapsedMs,sha256:sha(redact(result.output))});if(result.status!=='passed')throw Error(`${name} ${result.status}: ${redact(result.output).slice(-12000)}`);}
try{
 await run('ui-build',['web/node_modules/vite/bin/vite.js','build','--config','web/conformance-token/vite.config.ts']);
 await run('host-build',['scripts/windows-env.mjs','go','test','-c','-o',binary,'./server/internal/service']);
 await db.connect();beforeSchemas=await schemas();
 host=spawn(binary,['-test.run=^TestM06TokenBrowserFixtureHost$','-test.timeout=165s','-test.v'],{cwd:resolve('server/internal/service'),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,M06_TOKEN_BROWSER_FIXTURE:'1',M06_READY_FILE:ready,M06_WEB_ROOT:assets,M06_FIXTURE_NONCE:nonce}});
 host.stdout.on('data',bytes=>{log+=redact(bytes.toString());if(log.length>65536)log=log.slice(-65536);});host.stderr.on('data',bytes=>{log+=redact(bytes.toString());if(log.length>65536)log=log.slice(-65536);});
 const hostStarted=performance.now();while(!existsSync(ready)){if(host.exitCode!==null)throw Error(`Fixture host exited: ${log}`);if(performance.now()-hostStarted>20000)throw Error(`Fixture readiness exceeded20s: ${log}`);await new Promise(resolve=>setTimeout(resolve,50));}
 ({origin}=JSON.parse(readFileSync(ready,'utf8')));
 process.env.M06_TOKEN_ORIGIN=origin;process.env.M06_FIXTURE_NONCE=nonce;process.env.M06_BROWSER_OUTPUT=output;
 await run('browser',['node_modules/@playwright/test/cli.js','test','-c','web/playwright.m06.config.ts','--max-failures=1'],120000);
 passed=true;
}finally{
 let cleanupError=null;
 if(host?.pid&&host.exitCode===null){try{const closed=once(host,'close');if(!origin&&existsSync(ready))({origin}=JSON.parse(readFileSync(ready,'utf8')));if(!origin)throw Error('Missing owned fixture origin');await fetch(origin+'/__m06/stop',{method:'POST',headers:{Origin:origin,'X-M06-Fixture':nonce},signal:AbortSignal.timeout(3000)});const [code]=await bounded(closed,8000,'fixture shutdown');if(code!==0)throw Error(`Fixture exited${code}`);}catch(error){cleanupError=String(error);host.kill();passed=false;}}
 writeFileSync(resolve(output,'host.log'),redact(log));
 try{const after=await schemas();if(JSON.stringify(beforeSchemas)!==JSON.stringify(after)){cleanupError='Owned fixture schema cleanup did not restore namespace inventory';passed=false;}}catch(error){cleanupError??=String(error);passed=false;}await db.end().catch(()=>{});
 const sourceAfter=sourceBefore.map(({path})=>({path,sha256:sha(readFileSync(path))}));const sourceChanged=JSON.stringify(sourceBefore)!==JSON.stringify(sourceAfter);if(sourceChanged)passed=false;
 const artifacts=[...(existsSync(binary)?[{path:binary,sha256:sha(readFileSync(binary))}]:[]),...(existsSync(assets)?readdirSync(assets,{recursive:true}).filter(path=>/\.(html|js|css)$/.test(path)).map(path=>({path:resolve(assets,path),sha256:sha(readFileSync(resolve(assets,path)))})):[])];
 const manifest={milestone:'M06',scope:'real loopback HTTP token service and numeric React browser',status:passed?'passed':'pending-unverified',elapsedMs:performance.now()-started,steps,sourceBefore,sourceAfter,sourceChanged,artifacts,cleanupError,provider:'off',engineStateInjected:false,apiResponsesMocked:false,publicCatalogActivated:false,browserVariants:['individual','neighbour-teams'],observedModel:null};
 writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:manifest.status,evidence:output,elapsedMs:manifest.elapsedMs,cleanupError}));if(!passed)process.exitCode=1;
}
