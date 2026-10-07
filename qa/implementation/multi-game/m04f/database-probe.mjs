// Explicit opt-in only. Run through scripts/windows-env.mjs to provision the
// private native environment without copying credentials into arguments/output.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
if(process.argv[2]!=='--run') {
 console.log('Opt-in: node scripts/windows-env.mjs node qa/implementation/multi-game/m04f/database-probe.mjs --run');
 process.exit(0);
}
if(process.platform!=='win32'||!process.env.TEST_DATABASE_URL) throw Error('Requires native Windows private test environment');
const source='qa/implementation/multi-game/m04f/database_probe.go';
const sourcePaths=[source,'qa/implementation/multi-game/m04f/database-probe.mjs','go.mod','go.sum','scripts/windows-env.mjs','scripts/windows-tools.json',
 ...readdirSync(resolve(root,'web/server/records/migrations')).filter(name=>name.endsWith('.sql')).map(name=>'web/server/records/migrations/'+name)].sort();
const sources=()=>sourcePaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')}));
const before=sources();
const executable=resolve(root,'.local/m04f-database-probe.exe');
const built=spawnSync(process.execPath,['scripts/windows-env.mjs','go','build','-o',executable,source],{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:2<<20});
if(built.status!==0||built.error) throw Error('Probe build failed; inspect source/build separately');
const startedAt=new Date().toISOString(),started=performance.now();
const run=spawnSync(executable,[],{cwd:root,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:2<<20});
let result;
try{result=JSON.parse(run.stdout);}catch{throw Error('Probe produced no valid bounded diagnostic report');}
// Only the probe's structured stdout is saved. Raw stderr/driver messages and
// the private process environment are never copied into the capture.
const sourceUnchanged=JSON.stringify(before)===JSON.stringify(sources());
const report={name:'synthetic-raw-pgx-database-probe',startedAt,completedAt:new Date().toISOString(),elapsedMs:performance.now()-started,
 platform:process.platform,node:process.version,source,sources:before,sourceUnchanged,sourceSHA256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),
 exitCode:run.status,processError:run.error?.code??null,provider:{mode:'off',requests:0},result};
const out=resolve(root,'qa/implementation/multi-game/m04f');mkdirSync(out,{recursive:true});
const output='database-probe-'+startedAt.replaceAll(/[^0-9]/g,'')+'.json';
writeFileSync(join(out,output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({name:report.name,exitCode:run.status,elapsedMs:report.elapsedMs,passed:result.passed,iterations:result.iterations?.length,output:'qa/implementation/multi-game/m04f/'+output}));
if(run.status!==0||run.error||!result.passed||!sourceUnchanged) process.exitCode=1;
