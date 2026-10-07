// Finite native profile of one retained legal archive, with no database work.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
process.chdir(root);
const phase=process.argv[2];
if(process.platform!=='win32'||!['before','after','final'].includes(phase)||process.argv.length!==3)throw Error('Use profile-replay.mjs before|after|final on native Windows');
const folder='qa/implementation/multi-game/m04f';
if(existsSync(`${folder}/replay-${phase}.json`))throw Error('Preserve the existing capture before another run');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(readFileSync('qa/implementation/multi-game/m04e/spades-solo-terminal-fixture.json'));
const archive=resolve('.local/m04e-terminal-fixture-spades-solo.json');
if(sha(readFileSync(archive))!==receipt.archiveSHA256)throw Error('Retained archive changed');
function walk(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${path}/${e.name}`):[`${path}/${e.name}`]);}
function sources(){return [...walk('server').filter(p=>p.endsWith('.go')&&!p.endsWith('_test.go')),
  'go.mod','go.sum','scripts/windows-env.mjs','scripts/windows-tools.json',
  'server/internal/records/m04f_replay_benchmark_test.go','server/internal/records/platform_terminal_fixture_test.go',
  relative(root,fileURLToPath(import.meta.url)).replaceAll('\\','/')].sort().map(path=>({path,sha256:sha(readFileSync(path))}));}
const source=sources(),startedAt=new Date().toISOString(),start=performance.now();
const args=['scripts/windows-env.mjs','go','test','./server/internal/records','-run','^$','-bench','^BenchmarkM04FReplay$',
  '-benchtime=3x','-count=3','-benchmem','-timeout=90s',`-cpuprofile=.local/m04f-replay-${phase}.cpu`,
  `-memprofile=.local/m04f-replay-${phase}.mem`,`-o=.local/m04f-records-${phase}.test.exe`];
const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,M04F_REPLAY_ARCHIVE:archive,M04F_REPLAY_SHA256:receipt.archiveSHA256},windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:4<<20});
const output=(result.stdout??'')+(result.stderr??'');
const sourceUnchanged=JSON.stringify(source)===JSON.stringify(sources());
const report={phase,scope:'Retained Solo archive; full replay/checkpoint validation, excluding SQL, policy preparation and file loading from timed loops. CPU profile also includes initial archive validation.',command:[process.execPath,...args],archiveSHA256:receipt.archiveSHA256,
  startedAt,completedAt:new Date().toISOString(),elapsedMs:performance.now()-start,exitCode:result.status,error:result.error?.code??null,
  sourceUnchanged,source,sourceSHA256:sha(JSON.stringify(source)),output:`replay-${phase}.txt`,outputSHA256:sha(output),
  provider:{mode:'off',requests:0,observedModel:null}};
writeFileSync(`${folder}/${report.output}`,output);
writeFileSync(`${folder}/replay-${phase}.json`,JSON.stringify(report,null,2)+'\n');
console.log(output);
console.log(JSON.stringify({phase,exitCode:result.status,sourceUnchanged,elapsedMs:report.elapsedMs}));
if(result.status!==0||!sourceUnchanged)process.exitCode=1;
