// Explicit local QA listener; no build, browser, owner-table access or credential output.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../../..');
process.chdir(root);
const database=new URL(process.env.TEST_DATABASE_URL??'');
if(process.platform!=='win32'||database.hostname!=='127.0.0.1'||database.port!=='54331'||database.pathname!=='/cardford_windows_test') throw Error('Use windows-env with the existing guarded test database.');
const origin='http://localhost:4191';
await new Promise((done,fail)=>{const probe=createServer();probe.once('error',()=>fail(Error('QA port4191 is already in use.')));probe.listen(4191,'localhost',()=>probe.close(done));});
const directory=resolve('.local/rally-review');await mkdir(directory,{recursive:true});
const hands=[['H7','CJ','DJ','HJ','SJ','CQ','DQ','HQ','SQ','HK'],[],[],[]];
const used=new Set(hands.flat());
const remaining=['C','D','H','S'].flatMap(suit=>['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map(rank=>suit+rank)).filter(card=>!used.has(card));
for(const hand of hands)while(hand.length<13)hand.push(remaining.shift());
if(remaining.length||new Set(hands.flat()).size!==52)throw Error('Invalid private fixture construction.');
const fixture=resolve(directory,'trix-qa-deals.json');
await writeFile(fixture,JSON.stringify({id:'rally-native-qa-20261014',deals:Array.from({length:20},()=>hands.flat())})+'\n');
const binary=resolve('.local/cardford.exe');
const hash=createHash('sha256').update(await readFile(binary)).digest('hex');
const stdout=await open(resolve(directory,'fixture.stdout.log'),'a'),stderr=await open(resolve(directory,'fixture.stderr.log'),'a');
const child=spawn(binary,['--migrations','web/server/records/migrations','--web','web/dist'],{cwd:root,env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ENV:'test',IDENTITY_MODE:'local-test',BILLING_MODE:'fixture',JEV_MODE:'off',HOST:'localhost',PORT:'4191',APP_ORIGIN:origin,CARDFORD_TRIX_FIXTURE_FILE:fixture},windowsHide:true,detached:true,stdio:['ignore',stdout.fd,stderr.fd]});
await new Promise((done,fail)=>{child.once('spawn',done);child.once('error',()=>fail(Error('QA listener failed to start.')));});
const record={pid:child.pid,binary,binarySHA256:hash,origin,database:'cardford_windows_test',fixture,startedAt:new Date().toISOString(),health:'starting'};
await writeFile(resolve(directory,'fixture-server.json'),JSON.stringify(record,null,2)+'\n');
child.unref();await stdout.close();await stderr.close();
const deadline=Date.now()+60000;
while(Date.now()<deadline){
  try {const response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1500)});const health=await response.json();if(response.ok&&health.status==='ready'){record.health=health;await writeFile(resolve(directory,'fixture-server.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({pid:record.pid,origin,health,database:record.database,ownerAppUntouched:true}));process.exit(0);}}
  catch{/* Bounded readiness, never print a database URL. */}
  await new Promise(done=>setTimeout(done,250));
}
throw Error('QA listener readiness timed out; inspect private fixture logs and recorded PID.');
