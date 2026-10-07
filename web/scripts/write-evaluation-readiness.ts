import { mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { freezeManifest,type EvaluationManifest,type EvaluationVariant } from '../server/evaluation/multi-game/manifest.ts';
import { bytes,repositoryRoot,sha256 } from '../server/evaluation/multi-game/research.ts';

const sourceGraph=(roots:readonly string[])=>{
  const sources:Record<string,string>={};
  const visit=(path:string)=>{for(const entry of readdirSync(new URL(path+'/',repositoryRoot),{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    const child=path+'/'+entry.name;if(entry.isDirectory())visit(child);else if(/\.(go|ts)$/.test(entry.name))sources[child]=sha256(bytes(child));
  }};roots.forEach(visit);return sources;
};
export function readinessManifests():Map<string,string> {
  const outputs=new Map<string,string>();
  for(const variant of ['hearts-solo','spades-solo','spades-partners'] as const) {
    const partners=variant==='spades-partners',hearts=variant==='hearts-solo';
    const root=hearts?'web/server/games/hearts':'server/internal/games/spades';
    const sources=sourceGraph([root, ...(hearts?['web/server/strategy']:['server/internal/legacydecision'])]);
    const ruleFile=hearts?'web/server/games/hearts/engine.ts':'server/internal/games/spades/engine.go';
    const referenceFile=hearts?'web/server/games/hearts/reasoning/manifest.ts':'server/internal/games/spades/reasoning/policy.go';
    const candidateFile=partners?'server/internal/games/spades/reasoning/partner_resources.go':referenceFile;
    const manifest:EvaluationManifest={schemaVersion:'multi-game-evaluation-1.0.0',id:`${variant}-development-readiness-001`,purpose:'development',variant:variant as EvaluationVariant,
      ruleProfile:{id:hearts?'hearts-training-1.0.0':partners?'spades-training-1.0.0':'spades-solo-training-1.0.0',hash:sha256(bytes(ruleFile))},
      candidate:{id:partners?'spades-partner-resource-5.0.0':hearts?'hearts-baseline-1.0.0':'spades-tactics-2.1.0',hash:sha256(bytes(candidateFile))},
      reference:{id:hearts?'hearts-baseline-1.0.0':'spades-tactics-2.1.0',hash:sha256(bytes(referenceFile))},sourceHashes:sources,
      objective:partners?'Guarded activation, actual changed legal selections, bot/coach agreement on fresh complete hands; no strength claim.':'Prepared baseline readiness only; no changed-policy comparison has been executed.',
      horizon:'complete-hand',corpus:null,families:Array.from({length:partners?8:1},(_,i)=>({id:partners?`fresh-pr5-${String(i+1).padStart(3,'0')}`:`${variant}-readiness-only`,
        split:'discovery' as const,seed:partners?`cardford-pr5-development-${String(i+1).padStart(3,'0')}`:'not-consumed-readiness-only',sealed:false})),
      rotations:[0],seatAssignments:{candidate:[0],reference:[0]},environments:[hearts?'all seats retain Hearts baseline':'other three seats fixed frozen tactics2.1'],
      primaryEstimand:partners?'Descriptive guarded activations and changed candidate decisions on the same actor packets.':'No comparison estimand; preparation only.',
      usefulGain:null,maximumHarm:null,powerRationale:null,multiplicityAdjustment:null,sampleSize:null,
      stoppingRule:partners?'Exactly eight paired complete hands; never extend/retry automatically to chase activation.':'No run authorized by generating this readiness file.',
      missingRunHandling:'Retain censored decisions and unused starts; incomplete hands excluded from completed outcomes.',maxWallMs:60000,maxDecisionMs:60000,maxDecisions:partners?896:56,promotionAuthority:null};
    const frozen=freezeManifest(manifest);outputs.set(`qa/evaluation/multi-game/${variant}.manifest.json`,JSON.stringify(frozen.manifest,null,2)+'\n');
  }
  return outputs;
}
if(process.argv[1]&&new URL(`file:///${process.argv[1].replaceAll('\\','/')}`).href===import.meta.url) {
  if(process.argv.slice(2).some(arg=>arg!=='--check'))throw new Error('Usage: node web/scripts/write-evaluation-readiness.ts [--check]');
  for(const [path,content] of readinessManifests()){
    const output=new URL(path,repositoryRoot);
    if(process.argv.includes('--check')){if(readFileSync(output,'utf8')!==content)throw new Error(`Stale readiness manifest: ${path}`);}
    else{mkdirSync(new URL('./',output),{recursive:true});writeFileSync(output,content);}
  }
  console.log('Three current-variant development readiness manifests verified; no study/provider run dispatched.');
}
