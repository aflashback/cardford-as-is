// LAB-STR-01: bounded operator for immutable paired Trix studies.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeStrengthStudy, runStrengthStudy, summarizeStrengthDirectory } from '../web/server/evaluation/multi-game/lab/strength.ts';
import { resolveBuild } from './coach-lab-builds.mjs';
import { runBoundedNative } from './bounded-native-run.mjs';
import { immutableJson } from '../web/server/evaluation/multi-game/lab/storage.ts';
import { digest } from '../web/server/evaluation/multi-game/lab/contracts.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const home=resolve(root,'.local/evaluation/coach-lab');
export async function main(args=process.argv.slice(2)){
 const command=args.shift()??'help';
 if(command==='help'||command==='--help'){console.log('Paired Trix strength pilot (deterministic; no automatic promotion)\n\n  init --manifest FILE --config FILE --out DIRECTORY [--parent DEVELOPMENT_STUDY_DIRECTORY]\n  run --out DIRECTORY [--max-cells 1] [--max-wall-ms 1200000] [--resume]\n  summary --out DIRECTORY\n\nDevelopment and fresh-validation use separate seed reservations. Existing native confirmation remains unavailable. Each environment/deployment cell is separate. Small studies report insufficient evidence.');return;}
 assert.ok(['init','run','summary'].includes(command),'Unknown study command');const options={};
 for(let i=0;i<args.length;i++){const name=args[i];assert.match(name,/^--[a-z-]+$/);const key=name.slice(2);assert.ok(!Object.hasOwn(options,key),'Repeated option');if(key==='resume')options[key]=true;else{assert.ok(args[i+1]&&!args[i+1].startsWith('--'),'Missing option value');options[key]=args[++i];}}
 const allowed=command==='init'?['manifest','config','out','parent']:command==='run'?['out','max-cells','max-wall-ms','resume']:['out'];for(const key of Object.keys(options))assert.ok(allowed.includes(key),`Unknown option --${key}`);
 assert.ok(options.out,'--out required');const out=resolve(root,options.out);let result;
 if(command==='init'){assert.ok(options.manifest&&options.config,'--manifest and --config required');result=initializeStrengthStudy(JSON.parse(readFileSync(resolve(root,options.manifest),'utf8')),JSON.parse(readFileSync(resolve(root,options.config),'utf8')),out,{parentDirectory:options.parent?resolve(root,options.parent):undefined,registryDirectory:resolve(home,'strength-family-reservations')});console.log(JSON.stringify({studyHash:result.studyHash,stage:result.config.stage,cells:result.cells.map(c=>({id:c.id,environment:c.environment,deployment:c.deployment,episodes:c.manifest.base.families.length*c.manifest.base.rotations.length*2})),out},null,2));}
 else if(command==='summary'){result=summarizeStrengthDirectory(out);console.log(JSON.stringify(result,null,2));}
 else {result=await runStrengthStudy(out,{maxCells:Number(options['max-cells']??1),maxWallMs:Number(options['max-wall-ms']??1200000),resume:options.resume===true,resolveBundle:e=>resolveBuild(home,e.base.sourceHashes,e.lab.sourceIdentity)});console.log(JSON.stringify(result,null,2));if(result.attempts.some(a=>a.error))process.exitCode=1;}
}
export async function boundedMain(args=process.argv.slice(2)){
 const startedAt=new Date().toISOString();const result=await runBoundedNative(process.execPath,[fileURLToPath(import.meta.url),'--bounded-worker',...args],{cwd:root,milliseconds:1200000,maxBytes:16<<20,onData:value=>process.stdout.write(value)});
 const {output,...watchdog}=result;const invocation={schemaVersion:'coach-lab-study-operator-invocation-1.0.0',command:args[0]??'help',startedAt,watchdog,outputHash:digest(output),providerUsd:0};
 const outIndex=args.indexOf('--out');if(outIndex>=0&&args[outIndex+1])immutableJson(resolve(root,args[outIndex+1]+'.operator-invocations',digest(invocation)+'.json'),invocation);
 assert.equal(result.status,'passed',`Study operator did not pass: ${JSON.stringify(watchdog)}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);const worker=args[0]==='--bounded-worker';if(worker)args.shift();
 (worker?main(args):boundedMain(args)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
