// LAB-STR-01: predeclared paired native full-session comparisons. No promotion.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { digest, deepFreeze, validateRecord, type RunEnvelope, type DecisionRecord } from './contracts.ts';
import type { LabStrength } from './types.generated.ts';
import { freezeLabRun } from './freeze.ts';
import { bindArchive } from './archive.ts';
import { immutableJson, readJson } from './storage.ts';
import { runLab } from '../run.ts';
export type StrengthConfig=LabStrength;
type Cell={id:string;environment:string;deployment:'one-seat'|'both-partners';manifest:RunEnvelope;manifestHash:string};
export type StrengthStudy={schemaVersion:'coach-lab-strength-descriptor-1.0.0';studyHash:string;parentHash:string|null;config:StrengthConfig;template:RunEnvelope;cells:Cell[];formalConfirmationEligible:false;strengthClaim:false};
const bytesHash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const manifestHash=(value:unknown)=>bytesHash(JSON.stringify(value,null,2)+'\n');
const episodeId=(runId:string,familyId:string,rotation:number,arm:string)=>'episode-'+bytesHash(runId+'\0'+familyId+`\0${rotation}\0${arm}`).slice(0,24);
const protocol=(template:RunEnvelope,config:StrengthConfig)=>({template,rotations:config.rotations,deployments:config.deployments,environments:config.environments,usefulGain:config.usefulGain,maximumHarm:config.maximumHarm,minFamilies:config.minFamilies,powerRationale:config.powerRationale,multiplicityAdjustment:config.multiplicityAdjustment});
export function prepareStrengthStudy(templateInput:unknown,configInput:unknown,parent?:StrengthStudy):StrengthStudy {
 const template=structuredClone(freezeLabRun(templateInput).envelope) as RunEnvelope;
 const config=validateRecord<StrengthConfig>('strength',structuredClone(configInput));
 assert.equal(template.lab.selector.gameId,'trix','Trix study only');assert.ok(template.lab.selector.variantId.endsWith('partners'),'Team-session estimand requires Partners');
 assert.notEqual(template.base.candidate.id,template.base.reference.id,'Comparison requires distinct installed policies');
 assert.equal(new Set(config.families.map(f=>f.id)).size,config.families.length,'Duplicate family identity');assert.equal(new Set(config.families.map(f=>bytesHash(f.seed))).size,config.families.length,'Repeated family seed');
 assert.equal(new Set(config.environments.map(e=>e.id)).size,config.environments.length,'Duplicate environment identity');
 if(config.stage==='fresh-validation'){
  assert.ok(parent,'Fresh validation requires a frozen development parent');assert.equal(parent.config.stage,'development','Parent must be development');
  assert.equal(digest(protocol(template,config)),digest(protocol(parent.template,parent.config)),'Validation changed frozen policy or protocol');
  const used=new Set(parent.config.families.map(f=>bytesHash(f.seed)));assert.ok(config.families.every(f=>!used.has(bytesHash(f.seed))),'Validation reuses a development seed');
 }else assert.equal(parent,undefined,'Development cannot relabel a parent validation');
 const studyHash=digest({template,config,parentHash:parent?.studyHash??null});
 const cells:Cell[]=[];
 for(const environment of config.environments)for(const deployment of config.deployments)for(let offset=0;offset<config.families.length;offset+=2){
  // Native journals have a finite byte cap. At most two origin families share
  // a native archive; statistical cohorts combine family units across shards.
  const families=config.families.slice(offset,offset+2);
  const id='cell-'+digest({studyHash,environment,deployment,families}).slice(0,20);
  const manifest=structuredClone(template);manifest.runId=manifest.base.id=id;
  manifest.base.families=families.map(f=>({...f,split:'discovery',sealed:false}));manifest.base.rotations=config.rotations;
  // Native maxActions is per episode; maxDecisions is the complete batch.
  // Freeze a finite batch allowance for every planned arm/rotation/family.
  manifest.base.maxDecisions=Math.max(template.base.maxDecisions,template.lab.caps.maxActions*families.length*config.rotations.length*2);
  manifest.base.seatAssignments={candidate:deployment==='one-seat'?[0]:[0,2],reference:deployment==='one-seat'?[0]:[0,2]};
  manifest.base.environments=['fixed-seat-policies-1.0.0'];manifest.lab.seatPolicies=environment.seatPolicies;
  manifest.lab.familyRoles=families.map(f=>({id:f.id,role:config.stage==='development'?'development':'validation'}));
  manifest.base.primaryEstimand='Within-family mean across rotations of candidate minus reference focal-team full-session score margin; cells reported separately.';
  manifest.base.usefulGain=config.usefulGain;manifest.base.maximumHarm=config.maximumHarm;manifest.base.sampleSize=families.length;
  manifest.base.powerRationale=config.powerRationale;manifest.base.multiplicityAdjustment=config.multiplicityAdjustment;
  manifest.base.stoppingRule='Fixed preregistered families and rotations. Resume checkpoints only; never add families after observing results.';
  manifest.base.missingRunHandling='Retain every expected pair. A family contributes uncertainty only when every planned rotation is complete in both arms. Any missing/censored pair blocks a strength interpretation.';
  manifest.base.promotionAuthority=null;manifest.lab.config={id,variant:manifest.lab.selector.variantId};
  freezeLabRun(manifest);cells.push({id,environment:environment.id,deployment,manifest,manifestHash:manifestHash(manifest)});
 }
 return deepFreeze({schemaVersion:'coach-lab-strength-descriptor-1.0.0',studyHash,parentHash:parent?.studyHash??null,config,template,cells,formalConfirmationEligible:false,strengthClaim:false});
}
/** Recompute every cell from its source config; never trust an edited descriptor. */
export function loadStrengthStudy(out:string):StrengthStudy{
 const value=readJson<StrengthStudy>(join(out,'study.json'));const parent=existsSync(join(out,'parent-study.json'))?readJson<StrengthStudy>(join(out,'parent-study.json')):undefined;
 if(parent){const rebuilt=prepareStrengthStudy(parent.template,parent.config);assert.deepEqual(parent,rebuilt,'Parent descriptor changed');}
 const rebuilt=prepareStrengthStudy(value.template,value.config,parent);assert.deepEqual(value,rebuilt,'Study identity changed');
 for(const cell of rebuilt.cells)assert.equal(bytesHash(readFileSync(join(out,'manifests',cell.id+'.json'))),cell.manifestHash,'Cell manifest byte identity changed');return rebuilt;
}
export function initializeStrengthStudy(template:unknown,config:unknown,out:string,options:{parentDirectory?:string;registryDirectory?:string}={}){
 const parent=options.parentDirectory?loadStrengthStudy(options.parentDirectory):undefined;
 const study=prepareStrengthStudy(template,config,parent);
 const registry=resolve(options.registryDirectory??join(out,'..','family-reservations'));mkdirSync(registry,{recursive:true});
 const entries=readdirSync(registry).filter(f=>f.endsWith('.json')).map(f=>readJson<{stage:string;studyHash:string;seedHash:string}>(join(registry,f)));
 for(const family of study.config.families){const seedHash=bytesHash(family.seed);assert.ok(!entries.some(e=>e.seedHash===seedHash&&e.studyHash!==study.studyHash),'Family seed already reserved by another study; validation cannot reuse development outcomes');}
 assert.ok(!existsSync(out),'New study requires a nonexistent output directory');
 immutableJson(join(out,'study.json'),study);if(parent)immutableJson(join(out,'parent-study.json'),parent);
 for(const cell of study.cells)immutableJson(join(out,'manifests',cell.id+'.json'),cell.manifest);
 for(const family of study.config.families){const seedHash=bytesHash(family.seed);immutableJson(join(registry,seedHash+'.json'),{stage:study.config.stage,studyHash:study.studyHash,seedHash});}
 return study;
}
type Outcome={scores:number[];rounds:number;winnerSeats:number[];winnerIds:string[]};
type Episode={episodeId:string;familyId:string;arm:string;status:string;reason?:string;rounds:number;outcome:Outcome|null};
type Receipt={runId:string;manifestHash:string;sourceDigest:string;binaryDigest:string;episodes:Episode[];status:string};
type CellInput={cellId:string;receipt:unknown;decisions?:readonly DecisionRecord[]};
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
/** Deterministic percentile bootstrap resamples whole families, never moves/rotations. */
function interval(values:number[],seed:string,alpha:number){if(values.length<2)return null;let state=parseInt(seed.slice(0,8),16)||1;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};const samples=Array.from({length:4000},()=>mean(values.map(()=>values[Math.floor(random()*values.length)]))).sort((a,b)=>a-b);return [samples[Math.floor(alpha/2*samples.length)],samples[Math.min(samples.length-1,Math.floor((1-alpha/2)*samples.length))]];}
function teamMargin(outcome:Outcome,rotation:number,variant:string){assert.ok(outcome&&Array.isArray(outcome.scores)&&outcome.scores.length===2&&outcome.scores.every(Number.isFinite),'Malformed terminal team scores');assert.equal(outcome.rounds,variant.startsWith('basic-')?20:8,'Incomplete full-session outcome');return outcome.scores[rotation%2]-outcome.scores[1-rotation%2];}
const ownershipPolicy='trix-ownership-1.0.0';
const emptyOwnershipActivation=()=>({expectedDecisions:0,uncommittedDecisions:0,availableDecisions:0,missingExpectedTraceDecisions:0,malformedEvidenceDecisions:0,eligibleDecisions:0,forcedEligibleDecisions:0,unforcedEligibleDecisions:0,supportedScopeDecisions:0,outsideScopeDecisions:0,historicalProfileDecisions:0,suppressedOneTeamEligibleDecisions:0,choiceChangeMeasuredDecisions:0,selectedChangedDecisions:0});
function recordOwnershipActivation(counts:ReturnType<typeof emptyOwnershipActivation>,d:DecisionRecord,detail:Record<string,unknown>|null){
 counts.expectedDecisions++;
 if(d.executionStatus!=='committed'){counts.uncommittedDecisions++;return;}
 const raw=detail?.ownershipEvidence;
 if(raw===null||raw===undefined){counts.missingExpectedTraceDecisions++;return;}
 const e=typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 if(!e||e.version!=='trix-ownership-evidence-1.0.0'||typeof e.eligible!=='boolean'||!['four-twos-constraints','outside-scope','historical-profile'].includes(e.coverage as string)||e.eligible!==(e.coverage==='four-twos-constraints')||typeof e.suppressedOneTeam!=='boolean'||typeof e.priorCandidateId!=='string'||!e.priorCandidateId||typeof e.selectedChanged!=='boolean'){
  counts.malformedEvidenceDecisions++;return;
 }
 const changed=e.priorCandidateId!==d.selectedCandidateId;
 assert.equal(e.selectedChanged,changed,'Ownership selectedChanged disagrees with decision-time candidate IDs');
 counts.availableDecisions++;counts.choiceChangeMeasuredDecisions++;if(changed)counts.selectedChangedDecisions++;
 if(e.eligible){counts.eligibleDecisions++;counts[d.forced?'forcedEligibleDecisions':'unforcedEligibleDecisions']++;if(e.suppressedOneTeam)counts.suppressedOneTeamEligibleDecisions++;}
 counts[e.coverage==='four-twos-constraints'?'supportedScopeDecisions':e.coverage==='outside-scope'?'outsideScopeDecisions':'historicalProfileDecisions']++;
}
export function summarizeStrengthStudy(study:StrengthStudy,inputs:Iterable<CellInput>){
 const byId=new Map(study.cells.map(cell=>[cell.id,cell]));
 const summaries=new Map<string,ReturnType<typeof summarizeStrengthCell>>();
 // Consume each archive before asking a lazy reader for the next one. Only
 // compact per-cell summaries survive across iterations, never full traces.
 for(const input of inputs){
  assert.ok(!summaries.has(input.cellId),'Duplicate cell input');
  const cell=byId.get(input.cellId);assert.ok(cell,'Unknown cell identity');
  summaries.set(cell.id,summarizeStrengthCell(study,cell,input));
 }
 const cells=study.cells.map(cell=>summaries.get(cell.id)??summarizeStrengthCell(study,cell));
 return summarizeStrengthCells(study,cells);
}
function summarizeStrengthCell(study:StrengthStudy,cell:Cell,input?:CellInput){
  let episodes:Episode[]=[];
  if(input){const r=validateRecord<Receipt>('receipt',input.receipt);assert.equal(r.runId,cell.id,'Receipt cell identity mismatch');assert.equal(r.manifestHash,cell.manifestHash,'Receipt manifest identity mismatch');assert.equal(r.sourceDigest,cell.manifest.lab.sourceIdentity.sourceDigest,'Receipt source identity mismatch');assert.equal(r.binaryDigest,cell.manifest.lab.sourceIdentity.binaryDigest,'Receipt binary identity mismatch');episodes=r.episodes;}
  const expected=new Set(cell.manifest.base.families.flatMap(f=>study.config.rotations.flatMap(rotation=>['reference','candidate'].map(arm=>episodeId(cell.id,f.id,rotation,arm)))));
  assert.equal(new Set(episodes.map(e=>e.episodeId)).size,episodes.length,'Duplicate episode identity');assert.ok(episodes.every(e=>expected.has(e.episodeId)),'Unexpected episode identity');
  let completePairs=0,missingPairs=0,censoredPairs=0;const families:{familyId:string;meanPairedMargin:number|null}[]=[];
  const counts={candidate:{wins:0,ties:0,losses:0},reference:{wins:0,ties:0,losses:0}};
  const pairs: {familyId:string;rotation:number;status:string;candidateMargin:number|null;referenceMargin:number|null;pairedMargin:number|null}[]=[];
  for(const family of cell.manifest.base.families){const margins:number[]=[];
   for(const rotation of study.config.rotations){const arms=['reference','candidate'].map(arm=>episodes.find(e=>e.episodeId===episodeId(cell.id,family.id,rotation,arm)));
    for(let i=0;i<arms.length;i++){const e=arms[i];if(e){assert.equal(e.familyId,family.id,'Episode family identity mismatch');assert.equal(e.arm,i===0?'reference':'candidate','Episode arm identity mismatch');}}
    let status='complete',candidateMargin:number|null=null,referenceMargin:number|null=null;
    if(arms.some(a=>!a)){missingPairs++;status='missing';}else if(arms.some(a=>a?.status!=='complete'||!a.outcome)){censoredPairs++;status='censored';}else{
     referenceMargin=teamMargin(arms[0]!.outcome!,rotation,cell.manifest.lab.selector.variantId);candidateMargin=teamMargin(arms[1]!.outcome!,rotation,cell.manifest.lab.selector.variantId);completePairs++;margins.push(candidateMargin-referenceMargin);
     for(const [arm,margin] of [['reference',referenceMargin],['candidate',candidateMargin]] as const)counts[arm][margin>0?'wins':margin===0?'ties':'losses']++;
    }
    pairs.push({familyId:family.id,rotation,status,candidateMargin,referenceMargin,pairedMargin:status==='complete'?candidateMargin!-referenceMargin!:null});
   }families.push({familyId:family.id,meanPairedMargin:margins.length===study.config.rotations.length?mean(margins):null});
  }
  const values=families.flatMap(f=>f.meanPairedMargin===null?[]:[f.meanPairedMargin]);const alpha=.05/(study.config.environments.length*study.config.deployments.length);
  const uncertainty=interval(values,digest({studyHash:study.studyHash,cellId:cell.id}),alpha);
  const complete=completePairs===cell.manifest.base.families.length*study.config.rotations.length;
  const sufficient=complete&&values.length>=study.config.minFamilies;
  const thresholdResult=!sufficient||!uncertainty?'insufficient-evidence':uncertainty[1]<-study.config.maximumHarm?'harm-threshold-exceeded':uncertainty[0]>=study.config.usefulGain?'practical-gain-observed':'insufficient-evidence';
  // Activation is private trace evidence only; absence is unavailable, never zero.
  const activation={availableDecisions:0,eligibleDecisions:0,completeScopeDecisions:0,ambiguousScopeDecisions:0,dominanceAvailableDecisions:0,dominanceSelectedDecisions:0,choiceChangeMeasuredDecisions:0,selectedChangedDecisions:0};
  const ownership=cell.manifest.base.candidate.id===ownershipPolicy?emptyOwnershipActivation():undefined;
  // The archive policy pin is the executed seat policy. Opponent/partner
  // continuation traces and the reference arm cannot activate the treatment.
  const ownershipActors=new Map(cell.manifest.base.families.flatMap(f=>study.config.rotations.map(rotation=>[episodeId(cell.id,f.id,rotation,'candidate'),new Set(cell.manifest.base.seatAssignments.candidate.map(seat=>(seat+rotation)%4))] as const)));
  for(const d of input?.decisions??[]){
   assert.ok(expected.has(d.episodeId),'Activation decision episode identity mismatch');
   const detail=d.originalAnalysis as Record<string,unknown>|null;const history=detail?.historyEvidence as {eligible?:boolean;coverage?:string;priorReasoningCandidateId?:string;selectedChanged?:boolean;comparisons?:{candidateId:string;worse:number;better:number}[]}|undefined;
   if(ownership&&d.policyPin.id===ownershipPolicy&&d.policyPin.seat===d.actor&&ownershipActors.get(d.episodeId)?.has(d.actor))recordOwnershipActivation(ownership,d,detail);
   if(!history)continue;activation.availableDecisions++;if(history.eligible===true)activation.eligibleDecisions++;
   if(history.coverage==='complete'){activation.completeScopeDecisions++;const dominant=history.comparisons?.filter(c=>c.worse===0&&c.better>0)??[];if(dominant.length){activation.dominanceAvailableDecisions++;if(dominant.some(c=>c.candidateId===d.selectedCandidateId))activation.dominanceSelectedDecisions++;}else activation.ambiguousScopeDecisions++;}
   const prior=history.priorReasoningCandidateId;
   if(prior!==undefined||typeof history.selectedChanged==='boolean'){activation.choiceChangeMeasuredDecisions++;if(prior!==undefined?prior!==d.selectedCandidateId:history.selectedChanged)activation.selectedChangedDecisions++;}
  }
  return {cellId:cell.id,environment:cell.environment,deployment:cell.deployment,variant:cell.manifest.base.variant,plannedPairs:expected.size/2,completePairs,missingPairs,censoredPairs,familyUnits:values.length,plannedFamilies:families.length,minimumFamiliesMet:values.length>=study.config.minFamilies,meanPairedMargin:values.length?mean(values):null,uncertainty:{unit:'origin-family',method:'deterministic family percentile bootstrap; exploratory, no power guarantee',familywiseConfidence:.95,cellAlpha:alpha,interval:uncertainty},outcomes:counts,families,pairs,tacticActivation:activation.availableDecisions?activation:null,...(ownership?{ownershipActivation:ownership.expectedDecisions?ownership:null}:{}),status:thresholdResult,strengthClaim:false};
}
function summarizeStrengthCells(study:StrengthStudy,cells:ReturnType<typeof summarizeStrengthCell>[]){
 const cohorts=study.config.environments.flatMap(environment=>study.config.deployments.map(deployment=>{
  const shards=cells.filter(c=>c.environment===environment.id&&c.deployment===deployment);
  const families=shards.flatMap(c=>c.families);assert.equal(new Set(families.map(f=>f.familyId)).size,families.length,'Repeated origin family across native shards');
  const values=families.flatMap(f=>f.meanPairedMargin===null?[]:[f.meanPairedMargin]);const completePairs=shards.reduce((n,c)=>n+c.completePairs,0),missingPairs=shards.reduce((n,c)=>n+c.missingPairs,0),censoredPairs=shards.reduce((n,c)=>n+c.censoredPairs,0);
  const alpha=.05/(study.config.environments.length*study.config.deployments.length);const uncertainty=interval(values,digest({studyHash:study.studyHash,environment:environment.id,deployment}),alpha);
  const sufficient=missingPairs===0&&censoredPairs===0&&values.length>=study.config.minFamilies;
  const status=!sufficient||!uncertainty?'insufficient-evidence':uncertainty[1]<-study.config.maximumHarm?'harm-threshold-exceeded':uncertainty[0]>=study.config.usefulGain?'practical-gain-observed':'insufficient-evidence';
  const outcomes={candidate:{wins:0,ties:0,losses:0},reference:{wins:0,ties:0,losses:0}};for(const c of shards)for(const arm of ['candidate','reference'] as const)for(const result of ['wins','ties','losses'] as const)outcomes[arm][result]+=c.outcomes[arm][result];
  const tacticActivation=shards.some(c=>c.tacticActivation!==null)?{availableDecisions:0,eligibleDecisions:0,completeScopeDecisions:0,ambiguousScopeDecisions:0,dominanceAvailableDecisions:0,dominanceSelectedDecisions:0,choiceChangeMeasuredDecisions:0,selectedChangedDecisions:0}:null;
  if(tacticActivation)for(const c of shards)if(c.tacticActivation)for(const key of Object.keys(tacticActivation) as (keyof typeof tacticActivation)[])tacticActivation[key]+=c.tacticActivation[key];
  const ownershipActivation=shards.some(c=>c.ownershipActivation)?emptyOwnershipActivation():null;
  if(ownershipActivation)for(const c of shards)if(c.ownershipActivation)for(const key of Object.keys(ownershipActivation) as (keyof typeof ownershipActivation)[])ownershipActivation[key]+=c.ownershipActivation[key];
  return {...shards[0],cellId:'cohort-'+digest({studyHash:study.studyHash,environment:environment.id,deployment}).slice(0,20),subruns:shards.map(c=>({id:c.cellId,completePairs:c.completePairs,missingPairs:c.missingPairs,censoredPairs:c.censoredPairs,...('ownershipActivation' in c?{ownershipActivation:c.ownershipActivation}:{})})),plannedPairs:shards.reduce((n,c)=>n+c.plannedPairs,0),completePairs,missingPairs,censoredPairs,familyUnits:values.length,plannedFamilies:families.length,minimumFamiliesMet:values.length>=study.config.minFamilies,meanPairedMargin:values.length?mean(values):null,uncertainty:{...shards[0].uncertainty,interval:uncertainty},outcomes,families,pairs:shards.flatMap(c=>c.pairs),tacticActivation,...('ownershipActivation' in shards[0]?{ownershipActivation}:{}),status};
 }));
 return {schemaVersion:'coach-lab-strength-summary-1.0.0',studyHash:study.studyHash,stage:study.config.stage,parentHash:study.parentHash,criteria:{usefulGain:study.config.usefulGain,maximumHarm:study.config.maximumHarm,minFamilies:study.config.minFamilies,powerRationale:study.config.powerRationale,multiplicityAdjustment:study.config.multiplicityAdjustment},cells:cohorts,formalConfirmationEligible:false,strengthClaim:false,promotionEligible:false,interpretation:'Predeclared paired deterministic study. Environment/deployment cohorts remain separate; bounded native shards contribute complete origin-family means. Small pilots cannot establish stronger play; fresh validation is not custodian-admitted confirmation, expert labels, or human-learning evidence.'};
}
export function summarizeStrengthDirectory(out:string){
 const study=loadStrengthStudy(out);
 function* inputs():Generator<CellInput>{
  for(const cell of study.cells){
   const path=join(out,'runs',cell.id);if(!existsSync(join(path,'latest-export.json'))&&!existsSync(join(path,'receipt.json')))continue;
   const archive=bindArchive(join(out,'manifests',cell.id+'.json'),path);
   yield {cellId:cell.id,receipt:archive.receipt,decisions:archive.decisions};
  }
 }
 const summary=summarizeStrengthStudy(study,inputs());immutableJson(join(out,'summaries',digest(summary)+'.json'),summary);return summary;
}
export async function runStrengthStudy(out:string,options:{maxCells:number;maxWallMs:number;resume:boolean;resolveBundle:(e:RunEnvelope)=>{binaryPath:string;sourceRoot:string}}){
 const study=loadStrengthStudy(out);assert.ok(Number.isSafeInteger(options.maxCells)&&options.maxCells>0,'Positive max-cells required');assert.ok(Number.isSafeInteger(options.maxWallMs)&&options.maxWallMs>0&&options.maxWallMs<=1200000,'Study invocation ceiling is twenty minutes');const start=performance.now();const attempts:{cellId:string;error:string|null}[]=[];
 for(const cell of study.cells){if(attempts.length>=options.maxCells)break;const path=join(out,'runs',cell.id);if(existsSync(path)){
  // A recoverable native journal can precede its first derived export.
  if(existsSync(join(path,'latest-export.json'))||existsSync(join(path,'receipt.json'))){const archive=bindArchive(join(out,'manifests',cell.id+'.json'),path);if(archive.receipt.status==='complete')continue;}
  assert.ok(options.resume,'Incomplete native cell requires --resume');
 }
  const reserve=cell.manifest.lab.caps.maxWallMs+60000;if(performance.now()-start+reserve>options.maxWallMs)break;
  try{await runLab(join(out,'manifests',cell.id+'.json'),path,'development',{...options.resolveBundle(cell.manifest),resume:existsSync(path)});attempts.push({cellId:cell.id,error:null});}catch(error){attempts.push({cellId:cell.id,error:error instanceof Error?error.message:String(error)});break;}
 }
 const summary=summarizeStrengthDirectory(out);const result={studyHash:study.studyHash,attempts,elapsedMs:Math.round(performance.now()-start),stopReason:attempts.length===0&&summary.cells.some(c=>c.missingPairs||c.censoredPairs)?'insufficient-invocation-budget-for-next-cell':attempts.some(a=>a.error)?'native-attempt-failed':attempts.length>=options.maxCells?'max-cells-reached':'complete-or-invocation-budget',summary};immutableJson(join(out,'invocations',digest(result)+'.json'),result);return result;
}
