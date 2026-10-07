import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const folder=new URL('./',import.meta.url);
const read=name=>readFileSync(new URL(name,folder));
const sha=b=>createHash('sha256').update(b).digest('hex');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
function samples(name){
 const groups=new Map();
 for(const line of read(name).toString().split(/\r?\n/)){
  const m=line.match(/^Benchmark\S+\/hands-(\d+)-\d+\s+\d+\s+([\d.]+) ns\/op.*?([\d.]+) B\/op\s+([\d.]+) allocs\/op/);
  if(m){const hand=Number(m[1]);const group=groups.get(hand)??[];group.push({ns:Number(m[2]),bytes:Number(m[3]),allocations:Number(m[4])});groups.set(hand,group);}
 }
 if(groups.size!==3||[...groups.values()].some(v=>v.length!==3))throw Error(`Unexpected samples in ${name}`);
 return [...groups].map(([hands,rows])=>({hands,samples:rows,medianNS:median(rows.map(x=>x.ns)),medianBytes:median(rows.map(x=>x.bytes)),medianAllocations:median(rows.map(x=>x.allocations))}));
}
const manifests={};
for(const name of ['clone-before','clone-after','replay-before','replay-after','replay-final']){
 const manifest=JSON.parse(read(`${name}.json`));
 if(sha(read(`${name}.txt`))!==manifest.outputSHA256)throw Error(`Output drift ${name}`);
 if(name.startsWith('replay')&&(manifest.exitCode!==0||!manifest.sourceUnchanged))throw Error(`Failed replay ${name}`);
 manifests[name]=manifest;
}
const replayNames=['replay-before','replay-after','replay-final'];
if(new Set(replayNames.map(n=>manifests[n].archiveSHA256)).size!==1)throw Error('Replay inputs differ');
const benchmark='server/internal/records/m04f_replay_benchmark_test.go';
if(new Set(replayNames.map(n=>manifests[n].source.find(f=>f.path===benchmark)?.sha256)).size!==1)throw Error('Timed benchmark changed');
const result={scope:'Three repeated native microbenchmark samples per case. Observed medians, no statistical significance or whole-service/capacity claim.',
 archiveSHA256:manifests['replay-final'].archiveSHA256,timedReplayBenchmarkSHA256:manifests['replay-final'].source.find(f=>f.path===benchmark).sha256,
 reducer:{before:samples('clone-before.txt'),after:samples('clone-after.txt')},
 replay:{before:samples('replay-before.txt'),cloneOnly:samples('replay-after.txt'),final:samples('replay-final.txt')},
 caveats:['Reducer uses legal synthetic Partners history at 1/10/20 hands, not policy play.','Replay uses identical saved Solo archive prefixes at 1/3/5 hands with every checkpoint checked; no SQL, preparation or delivered-help work.','CPU profiling includes setup outside benchmark timers.','The runner gained a final output label after clone-only capture; the timed Go benchmark, archive, iteration counts and profile settings are identical.','No full acceptance or normal-match soak repeated for these measurements.']};
writeFileSync(new URL('profile-summary.json',folder),JSON.stringify(result,null,2)+'\n');
for(const name of ['reducer','replay'])console.log(JSON.stringify({name,before:result[name].before.map(({samples,...v})=>v),after:(result[name].final??result[name].after).map(({samples,...v})=>v)}));
