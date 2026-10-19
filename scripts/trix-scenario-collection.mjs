import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runBoundedNative } from './bounded-native-run.mjs';
import { preserveBuild, resolveBuild, sourceDigest } from './coach-lab-builds.mjs';
import { jsonBytes, safePath, withRunLock, writeImmutable } from './trix-scenario-collection/journal.mjs';
import { amendmentPath, campaignInventoryPath, readCampaignAmendment } from './trix-scenario-collection/campaign-continuation.mjs';
import { readLatestCampaignRecovery } from './trix-scenario-collection/campaign-recovery.mjs';
import { readLatestContextRecovery } from './trix-scenario-collection/context-recovery.mjs';
import { readLatestMetadataRecovery } from './trix-scenario-collection/metadata-recovery.mjs';
import { readLatestRationaleRecovery } from './trix-scenario-collection/forced-rationale-recovery.mjs';
import { readLatestGameReviewRecovery } from './trix-scenario-collection/game-review-recovery.mjs';
import { readLatestPlayerContextRecovery } from './trix-scenario-collection/player-context-recovery.mjs';
import { readLatestReviewTimeoutRecovery } from './trix-scenario-collection/review-timeout-recovery.mjs';
import { readLatestPlayerTimeoutRecovery } from './trix-scenario-collection/player-timeout-recovery.mjs';
import { readLatestReviewDeadlineRecovery } from './trix-scenario-collection/review-deadline-recovery.mjs';
import { readLatestReviewMemoryException } from './trix-scenario-collection/review-memory-exception.mjs';
import { readLatestIsolatedHostStopRecovery } from './trix-scenario-collection/isolated-host-stop-recovery.mjs';
import { readLatestIsolatedHostStopV2Recovery } from './trix-scenario-collection/isolated-host-stop-v2-recovery.mjs';
import { readLatestReviewStartupRpcRecovery, reviewStartupRpcProgress, assertReviewStartupRpcState } from './trix-scenario-collection/review-startup-rpc-recovery.mjs';
import { readLatestPlayerArchiveCancellationRecovery } from './trix-scenario-collection/player-archive-cancellation-recovery.mjs';
const repository=fileURLToPath(new URL('../',import.meta.url));
const defaultHome=resolve(repository,'.local/evaluation/trix-scenarios');

const validationExecutionCampaignCommands=new Set(['campaign','campaign-check','campaign-recovery-check','campaign-context-check','campaign-reference-check','campaign-rationale-check','campaign-game-review-check','campaign-player-context-check','campaign-review-timeout-check','campaign-player-timeout-check','campaign-review-deadline-check','campaign-review-memory-check','campaign-isolated-host-stop-check','campaign-isolated-host-stop-v2-check','campaign-player-archive-cancellation-check','campaign-review-startup-rpc-check','campaign-validation-execution-check']);
const eofGraceCampaignCommands=new Set([...validationExecutionCampaignCommands,'campaign-eof-grace-check']);
// This selects a manager only; its frozen authority validates the complete ledger.
export function selectEofGraceRecoveryRoute(collector,command){
  if(!eofGraceCampaignCommands.has(command))return false;
  if(collector.state().rows.some(row=>row.kind==='eof-grace-recovery-authorized'))return true;
  assert.notEqual(command,'campaign-eof-grace-check','EOF grace recovery not yet admitted');
  return false;
}
const preclaimStopAuditPath='reports/review-startup-rpc-preclaim-worker-stop-audit-20261013.json';
const preclaimStopAuditHash='11c5c6de91e83953aa183f173501ba78764cb37008b55a635911e5e5bf704c24';

// Routing only: the frozen execution manager must validate any indicated authority.
export function selectValidationExecutionRoute(collector,command){
  if(!validationExecutionCampaignCommands.has(command))return false;
  if(collector.state().rows.some(row=>row.kind==='validation-execution-amendment-authorized'))return true;
  assert.notEqual(command,'campaign-validation-execution-check','Execution amendment not yet admitted');
  assert.ok(!hasAuditedValidationExecutionStop(collector),'Execution amendment not yet admitted; the audited preclaim stop blocks the older campaign path');
  return false;
}
function hasAuditedValidationExecutionStop(collector){
  if(collector.manifest.runId!=='trix-luna-20261011-pilot')return false;
  const path=safePath(collector.root,preclaimStopAuditPath);
  try{assert.ok(lstatSync(path).isFile(),'Controlled-stop audit must be a regular file');}
  catch(error){if(error.code==='ENOENT')return false;throw error;}
  const bytes=readFileSync(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),preclaimStopAuditHash,'Controlled-stop audit changed');
  const audit=JSON.parse(bytes);
  assert.equal(audit.schemaVersion,'trix-preclaim-worker-stop-independent-audit-1.0.0');
  assert.equal(audit.status,'passed');assert.equal(audit.runId,collector.manifest.runId);
  return true;
}

export function validationExecutionPreparationOptions(collector,o){
  assert.ok(o.candidate,'--candidate required');assert.ok(o['source-review'],'--source-review required');
  assert.match(o['source-review-hash']??'',/^[a-f0-9]{64}$/,'--source-review-hash required');
  const candidate=JSON.parse(readFileSync(resolve(repository,o.candidate),'utf8'));
  const ref=candidate.evidence?.sourceReviewRef;assert.ok(ref,'Candidate source review reference required');
  assert.equal(resolve(repository,o['source-review']),safePath(collector.root,ref.path),'Source review path must match the candidate');
  assert.equal(ref.sha256,o['source-review-hash'],'External source review hash must match the candidate');
  return{candidate,sourceReviewHash:o['source-review-hash']};
}

function options(args){const out={};for(let i=0;i<args.length;i+=2){assert.match(args[i],/^--[a-z-]+$/);assert.ok(args[i+1]&&!args[i+1].startsWith('--'),'Option value required');assert.ok(!Object.hasOwn(out,args[i].slice(2)),'Repeated option');out[args[i].slice(2)]=args[i+1];}return out;}
function allowed(o,keys){for(const k of Object.keys(o))assert.ok(keys.includes(k),`Unknown option --${k}`);}
async function collectionStatus(collector){
  const state=collector.state(),lock=safePath(collector.root,'private/driver.lock');let activeWorker=null;
  if(existsSync(lock)){
    const owner=JSON.parse(readFileSync(lock,'utf8'));assert.ok(Number.isInteger(owner.pid)&&owner.pid>0);
    let alive=true;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}
    if(alive)activeWorker={pid:owner.pid,kind:owner.worker??'collection',startedAt:owner.startedAt};
  }
  if(state.rows.some(row=>row.kind==='eof-grace-recovery-authorized')){
    const {readLatestEofGraceRecovery,assertEofGraceState}=await import('./trix-scenario-collection/eof-grace-recovery.mjs');
    const latest=readLatestEofGraceRecovery(collector,{deep:false});
    const dynamic=assertEofGraceState(collector,latest,state,{active:false});let blocked=null;
    try{assertEofGraceState(collector,latest,state,{active:true});}catch(error){blocked=error.message;}
    return {...collector.status(),status:blocked?'paused':activeWorker?.kind==='eof-grace-full-campaign'?'running':'ready',activeWorker,
      eofGraceRecoveryHash:latest.recoveryHash,activeExecutionSourceDigest:latest.recovery.processingBuild.sourceDigest,
      executionBlockedBy:blocked,remainingTargetCalls:dynamic.remainingTargetCalls,stage:dynamic.stage,
      reviews:{decisions:state.reviews.filter(r=>r.stage==='decision').length,games:state.reviews.filter(r=>r.stage==='game').length,attempts:state.rows.filter(r=>r.kind==='review-dispatch-claimed').length},
      requestCoverage:collector.manifest.plan.phases.map(p=>({variant:p.variant,completed:state.outcomes.filter(o=>o.variant===p.variant).length,target:p.maxCompletedRequests})),segmentDeadline:null};
  }
  const continuation=existsSync(safePath(collector.root,amendmentPath))?readCampaignAmendment(collector).amendment:null;
  const recovery=continuation?readLatestCampaignRecovery(collector):null;
  const contextRecovery=recovery?readLatestContextRecovery(collector):null;
  const metadataRecovery=contextRecovery?readLatestMetadataRecovery(collector):null;
  const rationaleRecovery=metadataRecovery?readLatestRationaleRecovery(collector):null;
  const gameReviewRecovery=rationaleRecovery?readLatestGameReviewRecovery(collector):null;
  const playerContextRecovery=gameReviewRecovery?readLatestPlayerContextRecovery(collector):null;
  const reviewTimeoutRecovery=playerContextRecovery?readLatestReviewTimeoutRecovery(collector):null;
  const playerTimeoutRecovery=reviewTimeoutRecovery?readLatestPlayerTimeoutRecovery(collector):null;
  const reviewDeadlineRecovery=playerTimeoutRecovery?readLatestReviewDeadlineRecovery(collector):null;
  const reviewMemoryException=reviewDeadlineRecovery?readLatestReviewMemoryException(collector):null;
  const isolatedHostStopRecovery=reviewMemoryException?readLatestIsolatedHostStopRecovery(collector):null;
  const isolatedHostStopV2Recovery=isolatedHostStopRecovery?readLatestIsolatedHostStopV2Recovery(collector):null;
  const playerArchiveCancellationRecovery=isolatedHostStopV2Recovery?readLatestPlayerArchiveCancellationRecovery(collector):null;
  const reviewStartupRpcRecovery=playerArchiveCancellationRecovery?readLatestReviewStartupRpcRecovery(collector):null;
  const historicalSegmentDeadline=state.segmentStartedAt?new Date(Date.parse(state.segmentStartedAt)+collector.manifest.plan.workCaps.maxActiveSegmentWallMs).toISOString():null;
  const result={...collector.status(),...(activeWorker?.kind==='full-campaign'?{status:'running'}:{}),activeWorker,reviews:{decisions:state.reviews.filter(r=>r.stage==='decision').length,games:state.reviews.filter(r=>r.stage==='game').length,attempts:state.rows.filter(r=>r.kind==='review-dispatch-claimed').length,metadataNormalizations:state.rows.filter(r=>['review-metadata-normalized','review-reference-normalized'].includes(r.kind)).length,rationalePolicyApplications:state.rows.filter(r=>r.kind==='forced-rationale-imported').length,gameReviewClassifications:state.rows.filter(r=>r.kind==='game-review-classified').length},segmentDeadline:continuation?null:historicalSegmentDeadline,...(continuation?{historicalSegmentDeadline,executionPolicy:continuation.executionPolicy,reviewTiming:continuation.reviewTiming,requestCoverage:collector.manifest.plan.phases.map(p=>({variant:p.variant,completed:state.outcomes.filter(o=>o.variant===p.variant).length,target:p.maxCompletedRequests})),continuationSourceDigest:continuation.processingBuild.sourceDigest,...(recovery?{recoveryHash:recovery.recoveryHash,activeProcessingSourceDigest:recovery.recovery.processingBuild.sourceDigest,reconciledFailedInvocations:recovery.recovery.failedClaims.length}:{}),...(contextRecovery?{contextRecoveryHash:contextRecovery.recoveryHash,activeProcessingSourceDigest:contextRecovery.recovery.processingBuild.sourceDigest,activeContextDigest:contextRecovery.recovery.proof.actualDigest}:{}),...(metadataRecovery?{metadataRecoveryHash:metadataRecovery.recoveryHash,activeProcessingSourceDigest:metadataRecovery.recovery.processingBuild.sourceDigest}:{}),...(rationaleRecovery?{rationaleRecoveryHash:rationaleRecovery.recoveryHash,rationalePolicyVersion:rationaleRecovery.recovery.policyVersion,activeProcessingSourceDigest:rationaleRecovery.recovery.processingBuild.sourceDigest}:{}),...(gameReviewRecovery?{gameReviewRecoveryHash:gameReviewRecovery.recoveryHash,activeProcessingSourceDigest:gameReviewRecovery.recovery.processingBuild.sourceDigest}:{}),...(playerContextRecovery?{playerContextRecoveryHash:playerContextRecovery.recoveryHash,activeProcessingSourceDigest:playerContextRecovery.recovery.processingBuild.sourceDigest,activeContextDigest:playerContextRecovery.recovery.proof.actualDigest}:{})}:{} )};
  if(reviewTimeoutRecovery)Object.assign(result,{reviewTimeoutRecoveryHash:reviewTimeoutRecovery.recoveryHash,activeProcessingSourceDigest:reviewTimeoutRecovery.recovery.processingBuild.sourceDigest});
  if(playerTimeoutRecovery)Object.assign(result,{playerTimeoutRecoveryHash:playerTimeoutRecovery.recoveryHash,activeProcessingSourceDigest:playerTimeoutRecovery.recovery.processingBuild.sourceDigest});
  if(reviewDeadlineRecovery)Object.assign(result,{reviewDeadlineRecoveryHash:reviewDeadlineRecovery.recoveryHash,activeProcessingSourceDigest:reviewDeadlineRecovery.recovery.processingBuild.sourceDigest});
  if(reviewMemoryException)Object.assign(result,{reviewMemoryExceptionHash:reviewMemoryException.recoveryHash,activeProcessingSourceDigest:reviewMemoryException.recovery.processingBuild.sourceDigest,activeContextDigest:reviewMemoryException.recovery.newContextDigest});
  if(isolatedHostStopRecovery)Object.assign(result,{isolatedHostStopRecoveryHash:isolatedHostStopRecovery.recoveryHash,activeProcessingSourceDigest:isolatedHostStopRecovery.recovery.processingBuild.sourceDigest,activeContextDigest:isolatedHostStopRecovery.recovery.newContextDigest,recoveredTargetAdditionalCalls:0});
  if(isolatedHostStopV2Recovery)Object.assign(result,{isolatedHostStopV2RecoveryHash:isolatedHostStopV2Recovery.recoveryHash,activeProcessingSourceDigest:isolatedHostStopV2Recovery.recovery.processingBuild.sourceDigest,activeContextDigest:isolatedHostStopV2Recovery.recovery.newContextDigest,gracefulTransportPolicy:isolatedHostStopV2Recovery.recovery.transportDelegation.policyVersion,recoveredTargetAdditionalCalls:0});
  if(playerArchiveCancellationRecovery)Object.assign(result,{playerArchiveCancellationRecoveryHash:playerArchiveCancellationRecovery.recoveryHash,activeProcessingSourceDigest:playerArchiveCancellationRecovery.recovery.processingBuild.sourceDigest,activeContextDigest:playerArchiveCancellationRecovery.recovery.newContextDigest,archiveLifecyclePolicy:playerArchiveCancellationRecovery.recovery.transportDelegation.policyVersion,recoveredTargetAdditionalCalls:0});
  if(reviewStartupRpcRecovery){const paused=assertReviewStartupRpcState(collector,reviewStartupRpcRecovery,state).paused;Object.assign(result,{status:paused?'paused':activeWorker?.kind==='full-campaign'?'running':state.claimed?'awaiting-response':state.episode?'active':'ready',effectivePaused:paused,reviewStartupRpcRecoveryHash:reviewStartupRpcRecovery.recoveryHash,activeProcessingSourceDigest:reviewStartupRpcRecovery.recovery.processingBuild.sourceDigest,activeContextDigest:reviewStartupRpcRecovery.recovery.newContextDigest,remainingTargetCalls:reviewStartupRpcProgress(state,reviewStartupRpcRecovery).remainingTargetCalls,failedAttemptActualContextObserved:false});}
  if(state.rows.some(row=>row.kind==='validation-execution-amendment-authorized')){
    const {readLatestValidationExecutionAmendment,assertValidationExecutionState}=await import('./trix-scenario-collection/validation-execution-amendment.mjs');
    const latest=readLatestValidationExecutionAmendment(collector);let blocked=null;
    try{assertValidationExecutionState(collector,latest,collector.state());}catch(error){blocked=error.message;}
    Object.assign(result,{validationExecutionAmendmentHash:latest.amendmentHash,activeExecutionSourceDigest:latest.amendment.processingBuild.sourceDigest,executionBlockedBy:blocked,status:blocked?'paused':activeWorker?.kind==='validation-execution-full-campaign'?'running':result.status});
  }
  else if(hasAuditedValidationExecutionStop(collector))Object.assign(result,{status:'stopped',executionBlockedBy:'validation-execution-amendment-not-admitted'});
  return result;
}
export async function main(args=process.argv.slice(2)) {
  const command=args.shift()??'help';const o=options(args);
  if(command==='help')console.log('Approved EOF grace failure recovery:\n  admit-eof-grace-recovery --run-id ID --candidate FILE --source-review FILE --source-review-hash SHA256 (zero model calls)\n  campaign-eof-grace-check --run-id ID (frozen zero-call admission)\n  campaign --run-id ID --executable PATH_TO_AUDITED_CODEX_EXE\nOnly the exact failed review may use its remaining ordinary second attempt. Saved killed output stays rejected; all host and deadline limits remain unchanged.');
  if(command==='help')console.log('Reviewed validation execution amendment:\n  admit-validation-execution --run-id ID --candidate FILE --source-review FILE --source-review-hash SHA256 (separate execution authority, zero model calls)\n  campaign-validation-execution-check --run-id ID (frozen admission, zero calls)\n  campaign --run-id ID --executable PATH_TO_AUDITED_CODEX_EXE\nThe original semantic processors, host checks and attempt limits remain pinned.');
  if(command==='help')console.log('Exact startup/RPC recovery without observed model output:\n  recover-review-startup-rpc --run-id ID --source-review FILE [--review-id ID] (one consumed failure; only remaining second attempt)\n  campaign-review-startup-rpc-check --run-id ID (frozen admission, zero calls/imports)\n');
  if(command==='help')console.log('Saved player archive-cancellation recovery:\n  recover-player-archive-cancellation --run-id ID --source-review FILE [--decision-id ID] (exact earned response; zero target calls)\n  campaign-player-archive-cancellation-check --run-id ID (frozen admission, no native commit or call)\n');
  if(command==='help')console.log('Second completed isolated-host final recovery and bounded graceful shutdown:\n  recover-isolated-host-stop-v2 --run-id ID --source-review FILE [--review-id ID] (exact saved final; zero target calls)\n  campaign-isolated-host-stop-v2-check --run-id ID (frozen admission, zero calls)\n');
  if(command==='help')console.log('Completed isolated-host final recovery:\n  recover-isolated-host-stop --run-id ID --source-review FILE [--review-id ID] (retain original rejection; no target model call)\n  campaign-isolated-host-stop-check --run-id ID (frozen admission, zero calls)\n');
  if(command==='help')console.log('Owner-authorized one-review exception with memory isolation:\n  admit-review-memory --run-id ID --owner-authorization FILE --context-audit FILE (freeze exact scoped allowance, zero model calls)\n  campaign-review-memory-check --run-id ID (frozen admission, no new call)\n  campaign --run-id ID --executable PATH_TO_AUDITED_CODEX_EXE\nBoth original attempts remain consumed; only the named review may receive one third call. A failed replacement stops without a fourth call.');
  if(command==='help')console.log('Audited partial-output reviewer deadline recovery:\n  recover-review-deadline --run-id ID [--review-id ID] (freeze exact interrupted partial stream proof, zero model calls)\n  campaign-review-deadline-check --run-id ID (frozen admission, no new attempt)\nOriginal partial bytes and consumed attempt remain intact; only the original second attempt may continue.');
  if(command==='help')console.log('Audited stopped player timeout recovery:\n  recover-player-timeout --run-id ID [--decision-id ID] (freeze exact no-final proof, zero model calls)\n  campaign-player-timeout-check --run-id ID (frozen admission, no new attempt)\nThe failed first player attempt remains consumed; only the existing second attempt may continue the same native position.');
  if(command==='help')console.log('Audited stopped reviewer timeout recovery:\n  recover-review-timeout --run-id ID [--review-id ID] (freeze exact no-final proof, zero model calls)\n  campaign-review-timeout-check --run-id ID (frozen admission, no new attempt)\nThe first attempt remains consumed; campaign may use only the existing second attempt after admission.');
  if(command==='help')console.log('Audited saved-player context recovery:\n  admit-player-context --run-id ID --context-audit FILE (freeze the inspected second cutover, zero model calls)\n  campaign-player-context-check --run-id ID (frozen admission, no player commit or model call)\nCampaign/check selects the latest authorized recovery; original failed evidence and consumed attempts remain intact.');
  if(command==='help')console.log('Audited game-review reference classification:\n  recover-game-review --run-id ID [--review-id ID] (freeze saved game-review classification, zero calls)\n  campaign-game-review-check --run-id ID (frozen admission, no import or call)\nThe campaign command uses the latest authorized game-review recovery. Raw text/grades and winning-correction proof requirements remain intact.');
  if(command==='help')console.log('Audited forced-explanation classification recovery:\n  recover-rationale --run-id ID [--review-id ID] (freeze a separate semantic policy, zero model calls)\n  campaign-rationale-check --run-id ID (frozen admission, no import or model call)\nThe campaign uses the latest authorized recovery. Native forcedness and original explanation grades remain separate.');
  if(command==='help')console.log('Audited reference-only recovery:\n  recover-references --run-id ID [--review-id ID] (freeze exact saved-response recovery, zero model calls)\n  campaign-reference-check --run-id ID (frozen admission, no import or model call)\nThe campaign command uses the latest authorized metadata recovery; original prose and grades remain unchanged.');
  if(command==='help')console.log('Audited saved-response context recovery:\n  admit-context --run-id ID --context-audit FILE (freeze separate context/processor amendment, zero model calls)\n  campaign-context-check --run-id ID (frozen admission, no import or model call)\nThe campaign command uses the latest authorized context recovery. Original rejected evidence is preserved.');
  if(command==='help')console.log('Full collection after an explicit owner amendment:\n  continue-campaign --run-id ID --context-admission FILE (freeze policy/processor, no model call)\n  campaign-check --run-id ID [--context-admission FILE] (frozen admission, zero model calls)\n  recover-campaign --run-id ID (certify a stopped startup failure; no model call)\n  campaign-recovery-check --run-id ID (frozen recovery admission; zero model calls)\n  campaign --run-id ID [--context-admission FILE] [--cwd DIR] [--executable FILE]\nNo aggregate wall cap; retain invocation/attempt caps, review every game, defer selection.');
  if(command==='help'){console.log('Trix offline scenario collector\n  preflight --plan FILE\n  init --plan FILE --run-id ID\n  run --run-id ID --requests 4 --context-admission FILE [--cwd DIR] [--executable FILE]\n  next|status|pause|resume|report|transcript|curate|export|derive-export|replay --run-id ID\n  retry-review --run-id ID --requests REMAINING --context-admission FILE --original-deadline UTC\n  resume --run-id ID --new-segment true (explicit later segment after recovery)\n  review-completed --run-id ID --context-admission FILE (--original-deadline UTC | --new-segment true)\n  abandon --run-id ID --reason TEXT\n  external-cases --run-id ID --directory exports/VERSION\n  claim --run-id ID --job outbox/JOB.json --parent-thread UUID\n  accept --run-id ID --job outbox/JOB.json --response inbox/response.json --receipt inbox/receipt.json\n  review-packet --run-id ID --stage decision|game\n  import-review --run-id ID --job outbox/REVIEW.json --input inbox/review.json --receipt inbox/reviewer.json\n  close-batch --run-id ID --close-phase true|false\n\nrun dispatches sequential fresh Luna Max players and independent reviews. No deterministic player fallback.');return;}
  if(command==='preflight'||command==='init'){
    const {initializeRun,sourceHashes}=await import('./trix-scenario-collection/runner.mjs');
    const {validateCampaign}=await import('./trix-scenario-collection/contracts.mjs');
    const {inspectHostInvocation}=await import('./trix-scenario-collection/bridge.mjs');
    allowed(o,command==='init'?['plan','run-id']:['plan']);assert.ok(o.plan,'--plan required');const plan=validateCampaign(JSON.parse(readFileSync(resolve(repository,o.plan),'utf8')));
    const bridge=inspectHostInvocation();
    if(command==='preflight'){console.log(JSON.stringify({status:'configuration-valid',liveAdmission:bridge,model:plan.model,phaseOrder:plan.execution.phaseOrder,checksNotRun:['native-fixtures','live-admission','source-build-consistency']},null,2));return;}
    assert.ok(o['run-id'],'--run-id required');
    assert.equal(plan.status,'approved-for-implementation','Initialize only an approved campaign');
    const beforeBuild=sourceHashes();
    const buildDir=resolve(defaultHome,'native');mkdirSync(buildDir,{recursive:true});const binary=resolve(buildDir,process.platform==='win32'?'trixcollection.exe':'trixcollection');
    const build=await runBoundedNative(process.execPath,['scripts/windows-env.mjs','go','build','-trimpath','-o',binary,'./server/cmd/trixcollection'],{cwd:repository,milliseconds:300000});
    assert.equal(build.status,'passed',build.output);assert.deepEqual(sourceHashes(),beforeBuild,'Source changed during native build; rerun initialization');console.log(JSON.stringify(initializeRun({runId:o['run-id'],plan,binaryPath:binary}),null,2));return;
  }
  const perCommand={next:[],status:[],pause:[],resume:['new-segment'],abandon:['reason'],report:[],transcript:[],curate:[],export:[],'derive-export':[],replay:[],run:['requests','context-admission','cwd','executable'],'continue-campaign':['context-admission'],campaign:['context-admission','cwd','executable'],'campaign-check':['context-admission'],'recover-campaign':['context-admission'],'campaign-recovery-check':['context-admission'],'recover-review-startup-rpc':['review-id','baseline','inspection','source-review'],'campaign-review-startup-rpc-check':['context-admission'],'recover-player-archive-cancellation':['decision-id','baseline','inspection','source-review'],'recover-isolated-host-stop-v2':['review-id','baseline','inspection','source-review'],'recover-isolated-host-stop':['review-id','baseline','inspection','source-review'],'admit-review-memory':['owner-authorization','context-audit'],'campaign-review-memory-check':['context-admission'],'campaign-isolated-host-stop-check':['context-admission'],'campaign-isolated-host-stop-v2-check':['context-admission'],'campaign-player-archive-cancellation-check':['context-admission'],'recover-review-timeout':['review-id'],'campaign-review-timeout-check':['context-admission'],'recover-player-timeout':['decision-id'],'campaign-player-timeout-check':['context-admission'],'recover-review-deadline':['review-id'],'campaign-review-deadline-check':['context-admission'],'admit-player-context':['context-audit'],'campaign-player-context-check':['context-admission'],'recover-game-review':['review-id'],'campaign-game-review-check':['context-admission'],'recover-rationale':['review-id'],'campaign-rationale-check':['context-admission'],'recover-references':['review-id'],'campaign-reference-check':['context-admission'],'admit-context':['context-audit'],'campaign-context-check':['context-admission'],'retry-review':['requests','context-admission','original-deadline','cwd','executable'],'review-completed':['context-admission','original-deadline','new-segment','cwd','executable'],'external-cases':['directory'],claim:['job','parent-thread'],accept:['job','response','receipt'],'review-packet':['stage'],'import-review':['job','input','receipt'],'close-batch':['close-phase','reason']};
  perCommand['admit-eof-grace-recovery']=['candidate','source-review','source-review-hash'];
  perCommand['campaign-eof-grace-check']=['context-admission'];
  perCommand['admit-validation-execution']=['candidate','source-review','source-review-hash'];
  perCommand['campaign-validation-execution-check']=['context-admission'];
  assert.ok(Object.hasOwn(perCommand,command),'Unknown command');allowed(o,['run-id',...perCommand[command]]);assert.match(o['run-id']??'',/^[a-z0-9][a-z0-9-]{0,63}$/);
  const root=safePath(defaultHome,o['run-id']);
  const manifest=JSON.parse(readFileSync(safePath(root,'manifest.json'),'utf8'));
  // Later code changes cannot silently change an existing experiment's runner.
  let codeRoot=repository;
  if(manifest.build){
    const b=resolveBuild(root,manifest.sourceHashes,{sourceDigest:manifest.build.sourceDigest,binaryDigest:manifest.build.binaryDigest});
    codeRoot=b.sourceRoot;
  }
  const load=name=>import(pathToFileURL(resolve(codeRoot,'scripts/trix-scenario-collection',name)).href);
  const [{Collector:Runner},reviewAPI,exportAPI,curateAPI]=await Promise.all([load('runner.mjs'),load('review.mjs'),load('export.mjs'),load('curate.mjs')]);
  const collector=new Runner(root);
  if(existsSync(safePath(root,amendmentPath)))assert.ok(!['resume','run','retry-review','review-completed','claim','next','close-batch'].includes(command),'This run uses an authorized frozen continuation; use campaign, status or pause');
  const read=name=>{assert.ok(o[name],`--${name} required`);return JSON.parse(readFileSync(safePath(root,o[name]),'utf8'));};
  let result;
  if(command==='admit-eof-grace-recovery'){
    const preparationOptions=validationExecutionPreparationOptions(collector,o);
    const {prepareEofGraceRecovery}=await import('./trix-scenario-collection/eof-grace-recovery.mjs');
    const prepared=await prepareEofGraceRecovery(collector,preparationOptions);
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,executionSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(selectEofGraceRecoveryRoute(collector,command)){
    const {dispatchEofGraceRecoveryCampaign}=await import('./trix-scenario-collection/eof-grace-runtime.mjs');
    result=await dispatchEofGraceRecoveryCampaign(collector,{checkOnly:command!=='campaign',...(o['context-admission']?{contextAdmission:resolve(repository,o['context-admission'])}:{}),...(o.cwd?{cwd:resolve(o.cwd)}:{}),...(o.executable?{executable:resolve(o.executable)}:{})});
  }
  else if(command==='admit-validation-execution'){
    const preparationOptions=validationExecutionPreparationOptions(collector,o);
    const {prepareValidationExecutionAmendment}=await import('./trix-scenario-collection/validation-execution-amendment.mjs');
    const prepared=await prepareValidationExecutionAmendment(collector,preparationOptions);
    result={runId:manifest.runId,amendmentHash:prepared.amendmentHash,amendmentPath:prepared.amendmentPath,alreadyPrepared:prepared.alreadyPrepared,executionSourceDigest:prepared.amendment.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(selectValidationExecutionRoute(collector,command)){
    const {dispatchValidationExecutionCampaign}=await import('./trix-scenario-collection/validation-execution-runtime.mjs');
    result=await dispatchValidationExecutionCampaign(collector,{checkOnly:command!=='campaign',...(o['context-admission']?{contextAdmission:resolve(repository,o['context-admission'])}:{}),...(o.cwd?{cwd:resolve(o.cwd)}:{}),...(o.executable?{executable:resolve(o.executable)}:{})});
  }
  else if(command==='continue-campaign'){
    assert.ok(o['context-admission'],'--context-admission required');
    const {prepareCampaignContinuation}=await import('./trix-scenario-collection/campaign-continuation.mjs');
    const prepared=prepareCampaignContinuation(collector,{contextAdmission:resolve(repository,o['context-admission'])});
    result={runId:manifest.runId,amendmentPath,alreadyPrepared:prepared.alreadyPrepared,executionPolicy:prepared.amendment.executionPolicy,reviewTiming:prepared.amendment.reviewTiming,targetRequests:prepared.amendment.completionRequests.reduce((n,p)=>n+p.completed,0),processingSourceDigest:prepared.amendment.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(command==='recover-campaign'){
    const {prepareCampaignRecovery}=await import('./trix-scenario-collection/campaign-recovery.mjs');
    const prepared=prepareCampaignRecovery(collector,o['context-admission']?{contextAdmission:resolve(repository,o['context-admission'])}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,reconciledFailedInvocations:prepared.recovery.failedClaims.map(p=>p.jobId)};
  }
  else if(command==='admit-context'){
    assert.ok(o['context-audit'],'--context-audit required');
    const {prepareContextRecovery}=await import('./trix-scenario-collection/context-recovery.mjs');
    const prepared=prepareContextRecovery(collector,{auditPath:resolve(repository,o['context-audit'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.responseHash,activeContextDigest:prepared.recovery.proof.actualDigest};
  }
  else if(command==='recover-game-review'){
    const {prepareGameReviewRecovery}=await import('./trix-scenario-collection/game-review-recovery.mjs');
    const prepared=await prepareGameReviewRecovery(collector,o['review-id']?{reviewId:o['review-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.rawResponseHash};
  }
  else if(command==='recover-review-startup-rpc'){
    assert.ok(o['source-review'],'--source-review required');
    const {prepareReviewStartupRpcRecovery}=await import('./trix-scenario-collection/review-startup-rpc-recovery.mjs');
    const prepared=await prepareReviewStartupRpcRecovery(collector,{...(o['review-id']?{reviewId:o['review-id']}:{}),...(o.baseline?{baselinePath:resolve(repository,o.baseline)}:{}),...(o.inspection?{inspectionPath:resolve(repository,o.inspection)}:{}),sourceReviewPath:resolve(repository,o['source-review'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,remainingTargetCalls:prepared.recovery.remainingTargetCalls,actualFailedContextObserved:false};
  }
  else if(command==='recover-player-archive-cancellation'){
    assert.ok(o['source-review'],'--source-review required');
    const {preparePlayerArchiveCancellationRecovery}=await import('./trix-scenario-collection/player-archive-cancellation-recovery.mjs');
    const prepared=await preparePlayerArchiveCancellationRecovery(collector,{...(o['decision-id']?{decisionId:o['decision-id']}:{}),...(o.baseline?{baselinePath:resolve(repository,o.baseline)}:{}),...(o.inspection?{inspectionPath:resolve(repository,o.inspection)}:{}),sourceReviewPath:resolve(repository,o['source-review'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.responseHash,remainingTargetCalls:0};
  }
  else if(command==='recover-isolated-host-stop-v2'){
    assert.ok(o['source-review'],'--source-review required');
    const {prepareIsolatedHostStopV2Recovery}=await import('./trix-scenario-collection/isolated-host-stop-v2-recovery.mjs');
    const prepared=await prepareIsolatedHostStopV2Recovery(collector,{...(o['review-id']?{reviewId:o['review-id']}:{}),...(o.baseline?{baselinePath:resolve(repository,o.baseline)}:{}),...(o.inspection?{inspectionPath:resolve(repository,o.inspection)}:{}),sourceReviewPath:resolve(repository,o['source-review'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.responseHash,remainingTargetCalls:0};
  }
  else if(command==='recover-isolated-host-stop'){
    assert.ok(o['source-review'],'--source-review required');
    const {prepareIsolatedHostStopRecovery}=await import('./trix-scenario-collection/isolated-host-stop-recovery.mjs');
    const prepared=await prepareIsolatedHostStopRecovery(collector,{...(o['review-id']?{reviewId:o['review-id']}:{}),...(o.baseline?{baselinePath:resolve(repository,o.baseline)}:{}),...(o.inspection?{inspectionPath:resolve(repository,o.inspection)}:{}),sourceReviewPath:resolve(repository,o['source-review'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.responseHash,remainingTargetCalls:0};
  }
  else if(command==='admit-review-memory'){
    assert.ok(o['owner-authorization'],'--owner-authorization required');assert.ok(o['context-audit'],'--context-audit required');
    const {prepareReviewMemoryException}=await import('./trix-scenario-collection/review-memory-exception.mjs');
    const prepared=await prepareReviewMemoryException(collector,{ownerAuthorizationPath:resolve(repository,o['owner-authorization']),auditPath:resolve(repository,o['context-audit'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,activeContextDigest:prepared.recovery.newContextDigest};
  }
  else if(command==='recover-review-deadline'){
    const {prepareReviewDeadlineRecovery}=await import('./trix-scenario-collection/review-deadline-recovery.mjs');
    const prepared=await prepareReviewDeadlineRecovery(collector,o['review-id']?{reviewId:o['review-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(command==='recover-player-timeout'){
    const {preparePlayerTimeoutRecovery}=await import('./trix-scenario-collection/player-timeout-recovery.mjs');
    const prepared=await preparePlayerTimeoutRecovery(collector,o['decision-id']?{decisionId:o['decision-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(command==='recover-review-timeout'){
    const {prepareReviewTimeoutRecovery}=await import('./trix-scenario-collection/review-timeout-recovery.mjs');
    const prepared=await prepareReviewTimeoutRecovery(collector,o['review-id']?{reviewId:o['review-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence};
  }
  else if(command==='admit-player-context'){
    assert.ok(o['context-audit'],'--context-audit required');
    const {preparePlayerContextRecovery}=await import('./trix-scenario-collection/player-context-recovery.mjs');
    const prepared=await preparePlayerContextRecovery(collector,{auditPath:resolve(repository,o['context-audit'])});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.responseHash,activeContextDigest:prepared.recovery.proof.actualDigest};
  }
  else if(command==='recover-rationale'){
    const {prepareRationaleRecovery}=await import('./trix-scenario-collection/forced-rationale-recovery.mjs');
    const prepared=await prepareRationaleRecovery(collector,o['review-id']?{reviewId:o['review-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.rawResponseHash};
  }
  else if(command==='recover-references'){
    const {prepareMetadataRecovery}=await import('./trix-scenario-collection/metadata-recovery.mjs');
    const prepared=await prepareMetadataRecovery(collector,o['review-id']?{reviewId:o['review-id']}:{});
    result={runId:manifest.runId,recoveryHash:prepared.recoveryHash,recoveryPath:prepared.recoveryPath,alreadyPrepared:prepared.alreadyPrepared,processingSourceDigest:prepared.recovery.processingBuild.sourceDigest,authorizationSequence:prepared.authorization.sequence,savedResponseHash:prepared.recovery.proof.rawResponseHash};
  }
  else if(['campaign','campaign-check','campaign-recovery-check','campaign-context-check','campaign-reference-check','campaign-rationale-check','campaign-game-review-check','campaign-player-context-check','campaign-review-timeout-check','campaign-player-timeout-check','campaign-review-deadline-check','campaign-review-memory-check','campaign-isolated-host-stop-check','campaign-isolated-host-stop-v2-check','campaign-player-archive-cancellation-check','campaign-review-startup-rpc-check'].includes(command)){
    const {dispatchAuthorizedCampaign}=await import('./trix-scenario-collection/campaign-continuation.mjs');
    const recovery=readLatestCampaignRecovery(collector);
    const contextRecovery=recovery?readLatestContextRecovery(collector):null;
    const metadataRecovery=contextRecovery?readLatestMetadataRecovery(collector):null;
    const rationaleRecovery=metadataRecovery?readLatestRationaleRecovery(collector):null;
    const gameReviewRecovery=rationaleRecovery?readLatestGameReviewRecovery(collector):null;
    const playerContextRecovery=gameReviewRecovery?readLatestPlayerContextRecovery(collector):null;
    const reviewTimeoutRecovery=playerContextRecovery?readLatestReviewTimeoutRecovery(collector):null;
    const playerTimeoutRecovery=reviewTimeoutRecovery?readLatestPlayerTimeoutRecovery(collector):null;
    const reviewDeadlineRecovery=playerTimeoutRecovery?readLatestReviewDeadlineRecovery(collector):null;
    const reviewMemoryException=reviewDeadlineRecovery?readLatestReviewMemoryException(collector):null;
    const isolatedHostStopRecovery=reviewMemoryException?readLatestIsolatedHostStopRecovery(collector):null;
  const isolatedHostStopV2Recovery=isolatedHostStopRecovery?readLatestIsolatedHostStopV2Recovery(collector):null;
  const playerArchiveCancellationRecovery=isolatedHostStopV2Recovery?readLatestPlayerArchiveCancellationRecovery(collector):null;
  const reviewStartupRpcRecovery=playerArchiveCancellationRecovery?readLatestReviewStartupRpcRecovery(collector):null;
    if(command==='campaign-recovery-check')assert.ok(recovery,'No authorized recovery; use recover-campaign first');
    if(command==='campaign-context-check')assert.ok(contextRecovery,'No authorized context recovery; use admit-context first');
    if(command==='campaign-reference-check')assert.ok(metadataRecovery,'No authorized reference recovery; use recover-references first');
    if(command==='campaign-rationale-check')assert.ok(rationaleRecovery,'No authorized rationale recovery; use recover-rationale first');
    if(command==='campaign-game-review-check')assert.ok(gameReviewRecovery,'No authorized game-review recovery; use recover-game-review first');
    if(command==='campaign-player-context-check')assert.ok(playerContextRecovery,'No authorized player-context recovery; use admit-player-context first');
    if(command==='campaign-review-timeout-check')assert.ok(reviewTimeoutRecovery,'No authorized review-timeout recovery; use recover-review-timeout first');
    if(command==='campaign-player-timeout-check')assert.ok(playerTimeoutRecovery,'No authorized player-timeout recovery; use recover-player-timeout first');
    if(command==='campaign-review-deadline-check')assert.ok(reviewDeadlineRecovery,'No authorized review-deadline recovery; use recover-review-deadline first');
    if(command==='campaign-review-memory-check')assert.ok(reviewMemoryException,'No authorized review-memory exception; use admit-review-memory first');
    if(command==='campaign-isolated-host-stop-check')assert.ok(isolatedHostStopRecovery,'No authorized stopped-final recovery; use recover-isolated-host-stop first');
    if(command==='campaign-isolated-host-stop-v2-check')assert.ok(isolatedHostStopV2Recovery,'No authorized second stopped-final recovery; use recover-isolated-host-stop-v2 first');
    if(command==='campaign-player-archive-cancellation-check')assert.ok(playerArchiveCancellationRecovery,'No authorized player cancellation recovery; use recover-player-archive-cancellation first');
    if(command==='campaign-review-startup-rpc-check')assert.ok(reviewStartupRpcRecovery,'No authorized startup/RPC recovery; use recover-review-startup-rpc first');
    const dispatch=reviewStartupRpcRecovery?(await import('./trix-scenario-collection/review-startup-rpc-recovery.mjs')).dispatchReviewStartupRpcRecovery:playerArchiveCancellationRecovery?(await import('./trix-scenario-collection/player-archive-cancellation-recovery.mjs')).dispatchPlayerArchiveCancellationRecovery:isolatedHostStopV2Recovery?(await import('./trix-scenario-collection/isolated-host-stop-v2-recovery.mjs')).dispatchIsolatedHostStopV2Recovery:isolatedHostStopRecovery?(await import('./trix-scenario-collection/isolated-host-stop-recovery.mjs')).dispatchIsolatedHostStopRecovery:reviewMemoryException?(await import('./trix-scenario-collection/review-memory-exception.mjs')).dispatchReviewMemoryException:reviewDeadlineRecovery?(await import('./trix-scenario-collection/review-deadline-recovery.mjs')).dispatchReviewDeadlineRecovery:playerTimeoutRecovery?(await import('./trix-scenario-collection/player-timeout-recovery.mjs')).dispatchPlayerTimeoutRecovery:reviewTimeoutRecovery?(await import('./trix-scenario-collection/review-timeout-recovery.mjs')).dispatchReviewTimeoutRecovery:playerContextRecovery?(await import('./trix-scenario-collection/player-context-recovery.mjs')).dispatchPlayerContextRecovery:gameReviewRecovery?(await import('./trix-scenario-collection/game-review-recovery.mjs')).dispatchGameReviewRecovery:rationaleRecovery?(await import('./trix-scenario-collection/forced-rationale-recovery.mjs')).dispatchRationaleRecovery:metadataRecovery?(await import('./trix-scenario-collection/metadata-recovery.mjs')).dispatchMetadataRecovery:contextRecovery?(await import('./trix-scenario-collection/context-recovery.mjs')).dispatchContextRecovery:recovery?(await import('./trix-scenario-collection/campaign-recovery.mjs')).dispatchCampaignRecovery:dispatchAuthorizedCampaign;
    result=await dispatch(collector,{checkOnly:command!=='campaign',...(o['context-admission']?{contextAdmission:resolve(repository,o['context-admission'])}:contextRecovery?{}:{contextAdmission:safePath(root,campaignInventoryPath)}),...(o.cwd?{cwd:resolve(o.cwd)}:{}),...(o.executable?{executable:resolve(o.executable)}:{})});
  }
  else if(command==='run'||command==='retry-review'){
    assert.ok(o['context-admission'],'--context-admission required');
    const {runSequential}=await load('live-driver.mjs');
    const runOptions={requests:Number(o.requests??4),contextAdmission:resolve(repository,o['context-admission']),...(o.cwd?{cwd:resolve(o.cwd)}:{}),...(o.executable?{executable:resolve(o.executable)}:{})};
    let activeCollector=collector;
    if(command==='retry-review'){
      assert.ok(o.requests&&Number.isInteger(runOptions.requests)&&runOptions.requests>0&&runOptions.requests<=collector.manifest.plan.workCaps.batchRequests-collector.state().outcomes.length,'Specify only the remaining original pilot requests');
      assert.ok(o['original-deadline'],'--original-deadline required');
      const inventory=JSON.parse(readFileSync(runOptions.contextAdmission,'utf8'));
      assert.equal(inventory.schemaVersion,'trix-host-base-context-admission-1.0.0');
      assert.equal(inventory.approvedDigests?.length,1);assert.match(inventory.approvedDigests[0],/^[a-f0-9]{64}$/);
      assert.deepEqual(inventory,JSON.parse(readFileSync(safePath(root,'host-base-context-admission.json'),'utf8')),'Retry must use the original admitted host context');
      if(runOptions.cwd)assert.ok(existsSync(runOptions.cwd),'Host working directory missing');
      if(runOptions.executable)assert.ok(existsSync(runOptions.executable),'Host executable missing');
      const {prepareReviewRetry}=await import('./trix-scenario-collection/recovery.mjs');
      const recovery=prepareReviewRetry(collector,{originalDeadlineAt:o['original-deadline']});
      activeCollector=recovery.collector;
      console.log(JSON.stringify({event:'review-recovery-prepared',metadata:recovery.metadata}));
    }
    result=await runSequential(activeCollector,runOptions);
  }
  else if(command==='next')result=collector.next();else if(command==='status')result=await collectionStatus(collector);else if(command==='pause')result=collector.pause();
  else if(command==='resume'){
    assert.ok(o['new-segment']===undefined||o['new-segment']==='true','--new-segment accepts only explicit true');
    const {assertNormalResumeAllowed}=await import('./trix-scenario-collection/recovery.mjs');
    assertNormalResumeAllowed(root,{newSegment:o['new-segment']==='true'});result=collector.resume();
  }
  else if(command==='abandon')result=collector.abandon(o.reason);
  else if(command==='claim')result=collector.claim(read('job').jobId,o['parent-thread']);
  else if(command==='accept'){assert.ok(o.response);result=collector.accept(read('job').jobId,readFileSync(safePath(root,o.response)),read('receipt'));}
  else if(command==='review-packet')result=reviewAPI.makeReviewPacket(collector,o.stage);
  else if(command==='import-review')result=reviewAPI.importReview(collector,read('job'),read('input'),read('receipt'));
  else if(command==='transcript'){const {writeCompletedTranscripts}=await import('./trix-scenario-collection/transcript.mjs');result=writeCompletedTranscripts(collector);}
  else if(command==='derive-export'){const {deriveSelectionExport}=await import('./trix-scenario-collection/derived-export.mjs');result=await deriveSelectionExport(collector);}
  else if(command==='review-completed'){
    assert.ok(o['context-admission'],'--context-admission required');
    assert.ok(o['new-segment']===undefined||o['new-segment']==='true','--new-segment accepts only explicit true');
    const newSegment=o['new-segment']==='true';
    assert.ok(newSegment!==Boolean(o['original-deadline']),'Choose --original-deadline or an explicitly authorized --new-segment true');
    const {sourceHashes}=await import('./trix-scenario-collection/runner.mjs');
    const {verifyNativeCompatibility,assertDerivationQuiescent}=await import('./trix-scenario-collection/derived-export.mjs');
    const processing=withRunLock(root,()=>{
      assertDerivationQuiescent(root,collector.state());
      const hashes=sourceHashes();verifyNativeCompatibility(manifest.sourceHashes,hashes);
      const original=resolveBuild(root,manifest.sourceHashes,{sourceDigest:manifest.build.sourceDigest,binaryDigest:manifest.build.binaryDigest});
      const pins={sourceDigest:sourceDigest(hashes),binaryDigest:manifest.build.binaryDigest};
      const archived=preserveBuild(root,repository,hashes,pins,original.binaryPath);
      const audit={originalSourceDigest:manifest.build.sourceDigest,reviewSourceDigest:pins.sourceDigest,nativeBinaryDigest:pins.binaryDigest};
      writeImmutable(safePath(root,`private/review-processing/${pins.sourceDigest}.json`),jsonBytes({schemaVersion:'trix-review-processing-build-1.0.0',...audit,sourceHashes:hashes,sourceRoot:archived.sourceRoot,binaryPath:archived.binaryPath}));
      return {archived,audit};
    });
    const {runReviewWorker}=await import(pathToFileURL(resolve(processing.archived.sourceRoot,'scripts/trix-scenario-collection/review-worker.mjs')).href);
    result=await runReviewWorker(collector,{...(newSegment?{newSegment:true}:{originalDeadlineAt:o['original-deadline']}),contextAdmission:resolve(repository,o['context-admission']),processingAudit:processing.audit,progress:value=>console.log(JSON.stringify(value)),...(o.cwd?{cwd:resolve(o.cwd)}:{}),...(o.executable?{executable:resolve(o.executable)}:{})});
  }
  else if(command==='external-cases'){assert.ok(o.directory,'--directory required');const {readExternalCases}=await load('external-reader.mjs');const data=readExternalCases(safePath(root,o.directory));result={manifest:data.manifest,cases:data.cases.length,strategies:data.strategies.length,games:data.games.length};}
  else if(command==='curate')result=curateAPI.curate(collector);else if(command==='report')result=exportAPI.report(collector);else if(command==='export')result=exportAPI.exportCases(collector);else if(command==='replay')result=collector.replay();else if(command==='close-batch'){assert.ok(['true','false'].includes(o['close-phase']??'false'));result=exportAPI.closeBatch(collector,{closePhase:o['close-phase']==='true',...(o.reason?{reason:o.reason}:{})});}
  if(eofGraceCampaignCommands.has(command)&&!['eof-grace-recovery-admission-passed','campaign-collection-completed','campaign-admission-passed','campaign-recovery-admission-passed','context-recovery-admission-passed','metadata-recovery-admission-passed','rationale-recovery-admission-passed','game-review-recovery-admission-passed','player-context-recovery-admission-passed','review-timeout-recovery-admission-passed','player-timeout-recovery-admission-passed','review-deadline-recovery-admission-passed','review-memory-exception-admission-passed','isolated-host-stop-recovery-admission-passed','isolated-host-stop-v2-recovery-admission-passed','player-archive-cancellation-admission-passed','review-startup-rpc-admission-passed','validation-execution-admission-passed'].includes(result?.stop))process.exitCode=1;
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
