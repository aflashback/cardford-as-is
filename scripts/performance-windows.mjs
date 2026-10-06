// Native-only orchestration. Original M02/M02A scripts and evidence are read-only.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import assert from 'node:assert/strict';
import {args,assertWindowsNode,sha256,protocol} from './performance-common.mjs';

assertWindowsNode();
const options=args(),root=resolve(import.meta.dirname,'..');process.chdir(root);
const go=resolve(String(options.go??'.local/windows-tools/go1.26.8/go/bin/go.exe'));
const expectedGo=String(options['go-version']??'go1.26.8');
const output=resolve(String(options.out??'qa/implementation/multi-game/performance-windows'));
if(!output.includes('performance-windows'))throw new Error('Use a new performance-windows evidence path');
mkdirSync(output,{recursive:true});
const env={...process.env,GOTOOLCHAIN:'local',GOMODCACHE:resolve('.local/windows-tools/gomodcache'),GOCACHE:resolve('.local/windows-tools/gocache'),CGO_ENABLED:'0',GOOS:'windows',GOARCH:'amd64',GOFLAGS:'',NODE_OPTIONS:''};
const run=(exe,argv)=>{const start=performance.now(),result=spawnSync(exe,argv,{cwd:root,env,encoding:'utf8',maxBuffer:64<<20,windowsHide:true});const processWallMs=performance.now()-start;if(result.error)throw result.error;if(result.status!==0)throw new Error(`${exe} ${argv.join(' ')} failed (${result.status}): ${result.stdout}\n${result.stderr}`);return {stdout:result.stdout,stderr:result.stderr,processWallMs};};
const version=run(go,['version']).stdout.trim();assert.equal(version,`go version ${expectedGo} windows/amd64`,'native Go toolchain/version mismatch');
const protocolPath='qa/implementation/multi-game/performance-windows/protocol.md';
if(!existsSync(protocolPath))throw new Error('Freeze protocol before measurement');
function sourceManifest(){
 const paths=[];for(const base of ['server','web/server','web/shared']){const visit=dir=>{for(const item of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,item.name);if(item.isDirectory())visit(path);else if(/\.(go|ts|mjs|json)$/.test(item.name))paths.push(path);}};visit(resolve(base));}
 for(const item of readdirSync('scripts'))if(/^performance-.*\.(ts|mjs)$/.test(item))paths.push(resolve('scripts',item));
 for(const path of ['go.mod','go.sum','package-lock.json','scripts/windows-env.mjs','scripts/windows-tools.json',protocolPath])paths.push(resolve(path));
 if(options['go-modfile'])paths.push(resolve(String(options['go-modfile'])));
 return Object.fromEntries(paths.sort().map(path=>[relative(root,path).replaceAll('\\','/'),sha256(readFileSync(path))]));
}
const before=sourceManifest();
const workloadPath=resolve(output,'workload.json');
const workloadInfo=JSON.parse(run(process.execPath,['scripts/performance-workload.ts',`--out=${workloadPath}`]).stdout);
const binary=resolve('.local/windows-tools',`performance-${expectedGo}.exe`);mkdirSync(dirname(binary),{recursive:true});
const buildArgs=['build','-trimpath'];if(options['go-modfile'])buildArgs.push(`-modfile=${resolve(String(options['go-modfile']))}`);buildArgs.push('-o',binary,'./server/cmd/perf');
const build=run(go,buildArgs);
const variants=['legacy-go','native-go','node'];
function worker(variant,extra=[]){const base=[`--workload=${workloadPath}`,...extra];const result=variant==='node'?run(process.execPath,['scripts/performance-node.ts',...base]):run(binary,[`--variant=${variant}`,...base]);const report=JSON.parse(result.stdout);assert.equal(report.protocol,protocol);assert.equal(report.workloadSHA256,workloadInfo.sha256);assert.equal(report.cwd,root);assert.equal(report.platform,variant==='node'?'win32':'windows');assert.equal(report.runtime,variant==='node'?'v24.19.0':expectedGo);return {...report,parentProcessWallMs:result.processWallMs,launchExitLoaderAndOutputResidualMs:result.processWallMs-report.workerWallMs};}
const verification={};for(const variant of variants){verification[variant]=worker(variant,['--verify','--warmups=0','--samples=1']);assert.equal(verification[variant].samples[0].work.counts.checkpoints,422);}
const semanticKeys=['jobs','commandDecodes','transitions','checkpoints','observations','publicViews','candidateSets','candidates','publicOutputValidations','stateBytes','observationBytes','viewBytes','frameBytes'];
for(const variant of variants)for(const key of semanticKeys)assert.equal(verification[variant].samples[0].work.counts[key],verification.node.samples[0].work.counts[key],`${variant} output/semantic counter ${key}`);
const nativeCounts=verification['native-go'].samples[0].work.counts,nodeCounts=verification.node.samples[0].work.counts;
for(const key of Object.keys(nodeCounts))assert.equal(nativeCounts[key],nodeCounts[key],`matched semantic boundary ${key}`);
writeFileSync(resolve(output,'verification-native.json'),JSON.stringify({protocol,label:'correctness verification; timings excluded',workloadInfo,verification},null,2)+'\n');
if(options['verify-only']){assert.deepEqual(sourceManifest(),before,'source changed during verification');console.log(JSON.stringify({verified:true,variants,checkpoints:422,version,binary,output}));process.exit(0);}
if(options.profiles){
 const profiles=resolve(output,'profiles');mkdirSync(profiles,{recursive:true});
 const results={};
 for(const variant of ['legacy-go','native-go'])results[variant]={cpu:worker(variant,['--warmups=3','--samples=3',`--cpu-profile=${resolve(profiles,variant+'.cpu.pprof')}`]),alloc:worker(variant,['--warmups=0','--samples=1',`--alloc-profile=${resolve(profiles,variant+'.alloc.pprof')}`])};
 const nodeProfile=run(process.execPath,[`--cpu-prof`,`--cpu-prof-dir=${profiles}`,'--cpu-prof-name=node.cpuprofile','scripts/performance-node.ts',`--workload=${workloadPath}`,'--warmups=3','--samples=3']);results.node=JSON.parse(nodeProfile.stdout);
 writeFileSync(resolve(output,'profiles.json'),JSON.stringify({protocol,label:'profiled diagnostic runs; excluded from timing comparison',scope:{goCPU:'three warm jobs after three unprofiled warmups; default allocation sampling',goAlloc:'separate cold job, cumulative process allocation profile with MemProfileRate=1 after input preparation',nodeCPU:'whole process including imports, three warmups and three jobs; distinguish initialization from measured stacks'},version,results},null,2)+'\n');assert.deepEqual(sourceManifest(),before,'source changed during profiling');console.log(JSON.stringify({profiled:true,profiles}));process.exit(0);
}
const orders=[['legacy-go','native-go','node'],['node','native-go','legacy-go'],['native-go','node','legacy-go'],['legacy-go','node','native-go'],['node','legacy-go','native-go'],['native-go','legacy-go','node']];
const runs=[];
for(const [repetition,order] of orders.entries())for(const variant of order){const report=worker(variant,['--warmups=3','--samples=1']);assert.equal(report.verificationOnly,false);assert.notEqual(report.profilingOnly,true);assert.equal(report.warmups,3);assert.deepEqual(report.samples[0].work,verification[variant].samples[0].work,`${variant} measured output drift`);runs.push({repetition:repetition+1,order,variant,...report});}
assert.deepEqual(sourceManifest(),before,'source changed during final measurement');
const distribution=values=>{const sorted=[...values].sort((a,b)=>a-b);return {minimum:sorted[0],median:(sorted[2]+sorted[3])/2,maximum:sorted.at(-1),samples:values};};
const summary=Object.fromEntries(variants.map(variant=>{const records=runs.filter(r=>r.variant===variant);return [variant,{warmWallMs:distribution(records.map(r=>r.samples[0].wallMs)),coldJobWallMs:distribution(records.map(r=>r.coldJob.wallMs)),warmCPUUserMs:distribution(records.map(r=>r.samples[0].cpuUserMs)),warmCPUKernelMs:distribution(records.map(r=>r.samples[0].cpuKernelMs)),processLifetimePeakWorkingSetKiB:distribution(records.map(r=>r.samples[0].processLifetimePeakWorkingSetKiB))}];}));
const report={protocol,label:'native Windows sequential replay benchmark',createdAt:new Date().toISOString(),hardware:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem()},node:{version:process.version,path:process.execPath,sha256:sha256(readFileSync(process.execPath))},go:{version,path:go,sha256:sha256(readFileSync(go)),binary,binarySHA256:sha256(readFileSync(binary)),buildWallMs:build.processWallMs,buildArgs},runtimeEnvironment:{GOGC:env.GOGC??'default',GOMAXPROCS:env.GOMAXPROCS??'default',GOMEMLIMIT:env.GOMEMLIMIT??'default',NODE_OPTIONS:env.NODE_OPTIONS,CGO_ENABLED:env.CGO_ENABLED},sourceHashes:before,sourceManifestSHA256:sha256(JSON.stringify(before)),workloadInfo,orders,summary,runs,limitations:['Original legacy Go intentionally performs different internal work; only native-go/node have matched declared semantic boundaries.','Memory is lifetime peak working set including imports and warmups, not per-job live heap. Node source imports remain broader than the Go replay module.','No database, HTTP, policy, provider or UI execution is timed. Six samples do not establish p95 or capacity.']};
writeFileSync(resolve(output,'benchmark.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,version,summary},null,2));
