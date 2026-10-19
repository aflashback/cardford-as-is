// TSC25 execution-only amendment. Original source, semantics and attempt caps stay pinned.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,existsSync,readdirSync,lstatSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sourceHashes,repository} from './runner.mjs';
import {resolveBuild,preserveBuild,sourceDigest} from '../coach-lab-builds.mjs';
import {readJournal,jsonBytes,sha,safePath,writeImmutable,appendEvent,getBlob} from './journal.mjs';

export const validationExecutionVersion='trix-validation-execution-amendment-1.0.0';
export const validationExecutionAuthorizationKind='validation-execution-amendment-authorized';
export const validationExecutionSourceHash=sha(readFileSync(new URL(import.meta.url)));
export const validationExecutionPins=Object.freeze({
  runId:'trix-luna-20261011-pilot',sourceDigest:'69b2b702027adb2e47217441cb081501d8f528f49d8969dfec16e68c9b1bf78e',binaryDigest:'0ed25c6d0535f9eff50044d6f743c0ae7ecf291fb86adf4d7823813d6402ad3b',
  recoveryHash:'a649ff563dd289d033cc7571529709a1a03daab3c5dd3c42691533ca75f2462a',authorizationHash:'ba9146e121f42eda401eba1da1026ad31cab7f4a712497a025912e348ffa0ea1',journalHash:'f668fea5fc0320afb877d4d09b532f2387126cdda718c9aa7a6d6f0cfd470e4f',
  firstClaimHash:'114f91cd59c96942efa11f0798987a3cf44f01632a3778c65f571a136e82ae78',reviewId:'decision-7da625e1f17fe1244288c354',
  historicalBaselineHash:'4cff60fa6733866dc9482e4c71503106c89705014e77ea82b11dd7e60a4ad191',stopAuditHash:'11c5c6de91e83953aa183f173501ba78764cb37008b55a635911e5e5bf704c24',
  preservationBaselineHash:'1f1ea46a941a098f8bce400c4e086c5f11f8593a1452cd88169ba5f7fcb1a52e',
  leaseHash:'ce0074cea4f012841e19201c1a166002d888575933a33af8916b7aa77284d87f',leasePid:58200,leaseStartedAt:'2026-10-13T02:34:31.712Z',
});
const P=validationExecutionPins,manager='scripts/trix-scenario-collection/review-startup-rpc-recovery.mjs';
const originalPath='private/review-startup-rpc/recoveries/'+P.recoveryHash+'.json';
const originalBoundary={sequence:1964,hash:P.authorizationHash};
const ownFile='scripts/trix-scenario-collection/validation-execution-amendment.mjs';
export const validationExecutionRoutingFiles=Object.freeze(['scripts/trix-scenario-collection.mjs','planning/implementation/coach-lab/trix-scenario-collection/README.md']);
export const validationExecutionHelperFiles=Object.freeze(Object.fromEntries(['footprint','certificate','capture','provider','runtime','amendment','epoch'].map(name=>[name,'scripts/trix-scenario-collection/validation-execution-'+name+'.mjs'])));
const bootstrap={execArgv:[...process.execArgv],environment:{NODE_OPTIONS:process.env.NODE_OPTIONS??null,NODE_PATH:process.env.NODE_PATH??null}};
const bind=r=>({sequence:r.sequence,hash:r.hash}),clone=v=>JSON.parse(JSON.stringify(v));
const strict=(v,fields)=>assert.deepEqual(Object.keys(v).sort(),fields.sort(),'Unexpected schema fields');
const hash=h=>assert.match(h,/^[a-f0-9]{64}$/);
const sync=v=>{assert.ok(!v||typeof v.then!=='function','Run-lock work must be synchronous');return v;};
const normalized=p=>resolve(p).replaceAll('\\','/');
const read=(root,path)=>JSON.parse(readFileSync(safePath(root,path)));
export function executionArtifact(root,path){safePath(root,path);return{path,sha256:sha(readFileSync(safePath(root,path))) };}
export function readExecutionArtifact(root,ref){strict(ref,['path','sha256']);hash(ref.sha256);const bytes=readFileSync(safePath(root,ref.path));assert.equal(sha(bytes),ref.sha256,'Immutable execution evidence changed: '+ref.path);return JSON.parse(bytes);}
const rowAt=(rows,sequence)=>{const found=rows.filter(r=>r.sequence===sequence);assert.equal(found.length,1,'Missing or duplicate physical sequence');return found[0];};
const prefixBytes=(bytes,count)=>{let end=-1;for(let i=0;i<count;i++){end=bytes.indexOf(10,end+1);assert.ok(end>=0,'Missing physical journal prefix');}return bytes.subarray(0,end+1);};

export function readValidationExecutionOriginal(c){
  assert.equal(c.manifest.runId,P.runId);
  const recovery=readExecutionArtifact(c.root,{path:originalPath,sha256:P.recoveryHash});
  assert.deepEqual(recovery.processingBuild,{sourceDigest:P.sourceDigest,binaryDigest:P.binaryDigest});
  assert.equal(sourceDigest(recovery.sourceHashes),P.sourceDigest);assert.equal(Object.keys(recovery.sourceHashes).length,684);
  assert.equal(recovery.originalManifestHash,sha(readFileSync(safePath(c.root,'manifest.json'))));
  const rows=readJournal(c.root),authorization=rowAt(rows,1964);
  assert.equal(authorization.hash,P.authorizationHash);assert.equal(authorization.kind,'review-startup-rpc-recovery-authorized');
  assert.equal(authorization.data.recoveryHash,P.recoveryHash);assert.equal(authorization.data.recoveryPath,originalPath);
  assert.equal(rows.filter(r=>r.kind==='review-startup-rpc-recovery-authorized').length,1);
  return{recovery,recoveryHash:P.recoveryHash,recoveryPath:originalPath,authorization};
}
export async function loadValidationExecutionOriginal(c){
  const latest=readValidationExecutionOriginal(c),build=resolveBuild(c.root,latest.recovery.sourceHashes,latest.recovery.processingBuild);
  const frozen=await import(pathToFileURL(resolve(build.sourceRoot,manager)).href);
  assert.equal(frozen.reviewStartupRpcRecoverySourceHash,latest.recovery.sourceHashes[manager]);
  return{latest,frozen,build};
}

export function executionSourceReviewBinding(record){
  const {createdAt,evidence,...body}=record;
  const {sourceReviewRef,...otherEvidence}=evidence;
  return{...body,evidence:otherEvidence};
}
export function validateValidationExecutionRecord(c,record){
  const original=readValidationExecutionOriginal(c);
  strict(record,['schemaVersion','runId','createdAt','previousBoundary','physicalPrefix','originalRecoveryDelegation','processingBuild','sourceHashes','helperPins','nodeExecutable','hostExecutable','runtimeIdentity','routingChanges','evidence','staleLease','attemptPolicy','epochPolicy']);
  assert.equal(record.schemaVersion,validationExecutionVersion);assert.equal(record.runId,P.runId);assert.ok(Number.isFinite(Date.parse(record.createdAt)));
  assert.deepEqual(record.previousBoundary,originalBoundary);
  assert.deepEqual(record.physicalPrefix,{sha256:P.journalHash,rows:1964,lastHash:P.authorizationHash});
  assert.deepEqual(record.originalRecoveryDelegation,{recoveryHash:P.recoveryHash,recoveryPath:originalPath,authorization:originalBoundary,processingBuild:original.recovery.processingBuild,sourceHashes:original.recovery.sourceHashes});
  strict(record.processingBuild,['sourceDigest','binaryDigest']);assert.equal(record.processingBuild.binaryDigest,P.binaryDigest);assert.equal(sourceDigest(record.sourceHashes),record.processingBuild.sourceDigest);assert.notEqual(record.processingBuild.sourceDigest,P.sourceDigest);
  for(const [path,h]of Object.entries(record.sourceHashes)){safePath(c.root,path);hash(h);}
  for(const [path,change]of Object.entries(record.routingChanges)){
    assert.ok(validationExecutionRoutingFiles.includes(path),'Unapproved source replacement');strict(change,['previousSha256','nextSha256','patchRef']);hash(change.previousSha256);hash(change.nextSha256);
    assert.equal(change.previousSha256,original.recovery.sourceHashes[path]);assert.equal(change.nextSha256,record.sourceHashes[path]);assert.notEqual(change.previousSha256,change.nextSha256);
    strict(change.patchRef,['path','sha256']);safePath(c.root,change.patchRef.path);hash(change.patchRef.sha256);
  }
  for(const [path,h]of Object.entries(original.recovery.sourceHashes))if(record.sourceHashes[path]!==h){assert.ok(validationExecutionRoutingFiles.includes(path),'Original semantic source changed: '+path);assert.ok(record.routingChanges[path],'Routing source change lacks reviewed replacement');}
  assert.deepEqual(Object.keys(record.helperPins).sort(),Object.keys(validationExecutionHelperFiles).sort());
  for(const [name,path]of Object.entries(validationExecutionHelperFiles)){hash(record.sourceHashes[path]);assert.deepEqual(record.helperPins[name],{path,sha256:record.sourceHashes[path]});}
  assert.equal(record.sourceHashes[ownFile],validationExecutionSourceHash,'Amendment manager source is not this processor');
  strict(record.nodeExecutable,['path','sha256','version','platform','arch']);hash(record.nodeExecutable.sha256);
  strict(record.hostExecutable,['path','sha256']);assert.deepEqual(record.hostExecutable,{path:normalized(original.recovery.inventory.audit.hostExecutable),sha256:original.recovery.inventory.audit.executableHash});
  strict(record.runtimeIdentity,['root','cwd','execArgv','environment']);assert.equal(record.runtimeIdentity.root,normalized(c.root));assert.equal(record.runtimeIdentity.cwd,normalized(record.runtimeIdentity.cwd));
  assert.deepEqual(record.runtimeIdentity.execArgv,[],'Node preload/eval flags are not admitted');assert.deepEqual(record.runtimeIdentity.environment,{NODE_OPTIONS:null,NODE_PATH:null},'Node bootstrap environment is not admitted');
  strict(record.evidence,['historicalBaselineRef','preservationBaselineRef','stopReportRef','stopAuditRef','guardDiagnosisRef','snapshotDiagnosisRef','sourceReviewRef','captureMeasurementRef']);
  for(const ref of Object.values(record.evidence)){strict(ref,['path','sha256']);safePath(c.root,ref.path);hash(ref.sha256);}
  assert.equal(record.evidence.historicalBaselineRef.sha256,P.historicalBaselineHash);assert.equal(record.evidence.stopAuditRef.sha256,P.stopAuditHash);
  assert.equal(record.evidence.preservationBaselineRef.sha256,P.preservationBaselineHash);
  assert.deepEqual(record.staleLease,{path:'private/driver.lock',sha256:P.leaseHash,value:{pid:P.leasePid,startedAt:P.leaseStartedAt,worker:'full-campaign',reviewStartupRpcRecoveryHash:P.recoveryHash}});
  assert.deepEqual(record.attemptPolicy,{reviewId:P.reviewId,firstClaim:{sequence:1960,hash:P.firstClaimHash},remainingSecond:1,maxTargetClaims:2,ordinaryAttemptCap:2,absoluteDeadlineMs:300000,extraAllowance:0});
  assert.deepEqual(record.epochPolicy,{invocationFile:'private/validation-execution.json',publicationFile:'validation-execution-epoch.json',historicalPublications:'preserve-exact-inventory-and-bytes'});
  return original;
}

export function inventoryExecutionDirectory(root,directory){
  const result={};
  function walk(path){for(const entry of readdirSync(safePath(root,path),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){assert.ok(!entry.isSymbolicLink(),'Preservation symlink rejected');const next=path+'/'+entry.name;if(entry.isDirectory())walk(next);else{assert.ok(entry.isFile(),'Unsupported preservation entry');result[next]=sha(readFileSync(safePath(root,next)));}}}
  walk(directory);return result;
}
export function assertValidationExecutionNativeCheckpoint(c,state,baseline){
  const checkpoint=baseline.currentNativeFrame,last=state.rows.filter(r=>r.kind==='move-committed').at(-1);
  assert.ok(last,'Missing preserved native commit');assert.deepEqual(bind(last),checkpoint.lastCommit,'Native checkpoint commit changed');
  assert.deepEqual(last.data.frameRef,checkpoint.frameRef,'Native checkpoint frame changed');
  assert.equal(last.data.episodeId,checkpoint.episodeId);assert.equal(last.data.decisionId,checkpoint.decisionId);
  assert.equal(last.data.nextRevision,checkpoint.revision);assert.equal(last.data.nativeAfterDigest,checkpoint.nativeAfterDigest);
  const frame=getBlob(c.root,checkpoint.frameRef);
  assert.equal(frame.revision,checkpoint.revision,'Native checkpoint revision changed');
  assert.equal(sha(jsonBytes(frame.snapshot)),checkpoint.nativeAfterDigest,'Native checkpoint snapshot changed');
  const lifecycle=state.rows.filter(r=>['episode-started','episode-completed','episode-abandoned'].includes(r.kind)).at(-1);
  assert.ok(lifecycle,'Missing native episode lifecycle');
  if(state.frameRef!==null){
    assert.ok(state.episode,'Active native frame lacks an episode');assert.equal(lifecycle.kind,'episode-started','Active native checkpoint lifecycle changed');
    assert.ok(lifecycle.sequence<last.sequence,'Native episode started after preserved commit');
    assert.deepEqual(state.episode,lifecycle.data.episode);assert.equal(state.episode.episodeId,checkpoint.episodeId);
    for(const key of ['familyId','variant','request'])assert.equal(state.episode[key],last.data[key],'Active native episode changed');
    assert.deepEqual(state.frameRef,checkpoint.frameRef,'Native checkpoint changed');
    return;
  }
  assert.equal(state.episode,null,'Completed native checkpoint still has an active episode');
  assert.equal(lifecycle.kind,'episode-completed','Null native frame lacks exact completion');
  const completed=state.rows.filter(r=>r.kind==='episode-completed'&&r.data.episodeId===checkpoint.episodeId);
  assert.equal(completed.length,1,'Missing or duplicate native completion');assert.deepEqual(lifecycle,completed[0]);
  assert.ok(lifecycle.sequence>last.sequence,'Native completion precedes preserved commit');
  for(const key of ['episodeId','familyId','variant','request'])assert.equal(lifecycle.data[key],last.data[key],'Completed native episode changed');
  assert.deepEqual(lifecycle.data.frameRef,checkpoint.frameRef,'Completed native frame changed');
  assert.ok(frame.outcome&&typeof frame.outcome==='object','Completed native frame has no terminal outcome');
  assert.deepEqual(getBlob(c.root,lifecycle.data.outcomeRef),frame.outcome,'Completed native outcome changed');
  const laterNative=state.rows.filter(r=>r.sequence>lifecycle.sequence&&['episode-started','episode-abandoned','job-prepared','dispatch-claimed','response-saved','commit-intent','move-committed'].includes(r.kind));
  assert.equal(laterNative.length,0,'Native activity followed preserved completion');
}
export function verifyExecutionPreservation(c,record,{state=c.state(),preparation=false}={}){
  const old=readExecutionArtifact(c.root,record.evidence.historicalBaselineRef),baseline=readExecutionArtifact(c.root,record.evidence.preservationBaselineRef);
  assert.equal(old.schemaVersion,'trix-review-startup-rpc-preservation-baseline-1.0.0');assert.equal(Object.keys(old.files).length,9602);assert.equal(old.originalPublicationFilesAbsent.length,15);
  assert.equal(baseline.schemaVersion,'trix-validation-execution-preservation-baseline-1.0.0');assert.equal(baseline.runId,P.runId);
  assert.deepEqual(baseline.journal,{path:'private/journal.jsonl',sha256:P.journalHash,rows:1964,lastHash:P.authorizationHash});assert.deepEqual(baseline.originalBaselineRef,record.evidence.historicalBaselineRef);
  const rows=state.rows.filter(r=>r.sequence<=1964);assert.equal(rows.length,1964);assert.deepEqual(bind(rows.at(-1)),originalBoundary);
  const physical=readFileSync(safePath(c.root,'private/journal.jsonl'));assert.equal(sha(prefixBytes(physical,1964)),P.journalHash);if(preparation)assert.equal(sha(physical),P.journalHash);
  const bindings=kind=>rows.filter(r=>r.kind===kind).map(r=>({...bind(r),data:r.data}));
  assert.deepEqual(bindings('review-imported'),old.acceptedReviewBindings);assert.equal(old.acceptedReviewBindings.length,169);assert.deepEqual(baseline.acceptedReviewBindings,old.acceptedReviewBindings);
  assert.deepEqual(bindings('move-committed'),old.committedMoves);assert.equal(old.committedMoves.length,216);assert.deepEqual(baseline.committedMoves,old.committedMoves);
  assert.deepEqual(bindings('episode-completed'),baseline.episodeOutcomes);assert.deepEqual(baseline.currentNativeFrame,old.currentNativeFrame);
  const last=old.committedMoves.at(-1);assert.deepEqual(bind(last),old.currentNativeFrame.lastCommit);assert.deepEqual(last.data.frameRef,old.currentNativeFrame.frameRef);assert.equal(last.data.nativeAfterDigest,old.currentNativeFrame.nativeAfterDigest);assert.equal(last.data.nextRevision,old.currentNativeFrame.revision);
  getBlob(c.root,old.currentNativeFrame.frameRef);
  if(preparation)assertValidationExecutionNativeCheckpoint(c,state,old);
  for(const [path,h]of Object.entries(old.files))assert.equal(baseline.files[path],h,'New baseline omitted inherited file');
  for(const [path,h]of Object.entries(baseline.files))assert.equal(sha(readFileSync(safePath(c.root,path))),h,'Preserved file changed: '+path);
  assert.ok(old.originalPublicationFilesAbsent.every(path=>baseline.absent.includes(path)));
  for(const path of baseline.absent)assert.equal(existsSync(safePath(c.root,path)),false,'Absent original publication recreated: '+path);
  assert.deepEqual(baseline.rawGameFileInventories,old.rawGameFileInventories);
  for(const [episode,inventory]of Object.entries(baseline.rawGameFileInventories))assert.deepEqual(inventoryExecutionDirectory(c.root,'raw-games/'+episode),inventory,'Historical raw directory changed');
  return{old,baseline};
}

export function verifyExecutionSourceReplacements(c,record){
  for(const [path,change]of Object.entries(record.routingChanges)){
    const patch=readExecutionArtifact(c.root,change.patchRef);strict(patch,['schemaVersion','path','previousSha256','nextSha256','previousBytesBase64','nextBytesBase64']);
    assert.equal(patch.schemaVersion,'trix-reviewed-source-replacement-1.0.0');assert.equal(patch.path,path);assert.equal(patch.previousSha256,change.previousSha256);assert.equal(patch.nextSha256,change.nextSha256);
    for(const key of ['previous','next']){const bytes=Buffer.from(patch[key+'BytesBase64'],'base64');assert.equal(bytes.toString('base64'),patch[key+'BytesBase64']);assert.equal(sha(bytes),patch[key+'Sha256'],'Reviewed replacement bytes changed');}
  }
}
function verifyRuntimeIdentity(record){
  assert.deepEqual(bootstrap,{execArgv:[],environment:{NODE_OPTIONS:null,NODE_PATH:null}},'Unadmitted Node bootstrap inputs');
  assert.deepEqual(process.execArgv,record.runtimeIdentity.execArgv);assert.deepEqual({NODE_OPTIONS:process.env.NODE_OPTIONS??null,NODE_PATH:process.env.NODE_PATH??null},record.runtimeIdentity.environment);
  assert.equal(normalized(process.cwd()),record.runtimeIdentity.cwd,'Node process working directory changed');
  assert.deepEqual(record.nodeExecutable,{path:normalized(realpathSync(process.execPath)),sha256:sha(readFileSync(process.execPath)),version:process.version,platform:process.platform,arch:process.arch},'Node runtime changed');
  assert.equal(sha(readFileSync(record.hostExecutable.path)),record.hostExecutable.sha256,'Host executable changed');
  assert.equal(sha(readFileSync(new URL(import.meta.url))),validationExecutionSourceHash,'Loaded amendment source changed');
}
export function verifyExecutionStaticInputs(c,latest,{deep=false,sourceRoot}={}){
  const record=latest.amendment??latest;validateValidationExecutionRecord(c,record);verifyRuntimeIdentity(record);
  assert.equal(sha(prefixBytes(readFileSync(safePath(c.root,'private/journal.jsonl')),1964)),P.journalHash,'Original physical journal prefix changed');
  if(latest.amendmentHash){const bytes=readFileSync(safePath(c.root,latest.amendmentPath));assert.equal(sha(bytes),latest.amendmentHash);assert.deepEqual(JSON.parse(bytes),record);}
  // The new graph is independent of the unchanged old semantic archive.
  if(sourceRoot){assert.deepEqual(sourceHashes(sourceRoot),record.sourceHashes,'Candidate source graph changed');}
  else resolveBuild(c.root,record.sourceHashes,record.processingBuild);
  for(const artifact of Object.values(record.evidence))readExecutionArtifact(c.root,artifact);
  verifyExecutionSourceReplacements(c,record);
  const review=readExecutionArtifact(c.root,record.evidence.sourceReviewRef);strict(review,['schemaVersion','status','reviewer','binding']);assert.equal(review.schemaVersion,'trix-validation-execution-source-review-1.0.0');assert.equal(review.status,'passed-validation-execution-source-audit');assert.ok(typeof review.reviewer==='string'&&review.reviewer.trim());assert.deepEqual(review.binding,executionSourceReviewBinding(record),'Independent source review does not bind this processor');
  const stop=readExecutionArtifact(c.root,record.evidence.stopAuditRef);assert.equal(stop.status,'passed');assert.equal(stop.runId,P.runId);assert.deepEqual(stop.stopReportRef,record.evidence.stopReportRef);assert.equal(stop.journal.sha256,P.journalHash);assert.equal(stop.journal.rows,1964);assert.equal(stop.journal.targetClaims,1);assert.equal(stop.journal.secondClaimAbsent,true);assert.equal(stop.driverLockRef.sha256,P.leaseHash);
  const measurement=readExecutionArtifact(c.root,record.evidence.captureMeasurementRef);assert.equal(measurement.status,'captured-and-freshly-rechecked');assert.equal(measurement.before.journalHash,P.journalHash);assert.deepEqual(measurement.before,measurement.after);assert.equal(measurement.modelCalls,0);assert.equal(measurement.nativeGameCalls,0);assert.equal(measurement.campaignWrites,0);
  if(deep){resolveBuild(c.root,record.originalRecoveryDelegation.sourceHashes,record.originalRecoveryDelegation.processingBuild);verifyExecutionPreservation(c,record);}
  return{sourceDigest:record.processingBuild.sourceDigest,sourceReviewHash:record.evidence.sourceReviewRef.sha256};
}

function assertExecutionRows(c,latest,state,active){
  const r=latest.amendment;assert.ok(r);assert.equal(normalized(c.root),r.runtimeIdentity.root);
  const rows=state.rows;assert.equal(rows.length,rows.at(-1)?.sequence);assert.deepEqual(bind(rowAt(rows,1964)),originalBoundary);
  const auths=rows.filter(row=>row.kind===validationExecutionAuthorizationKind);assert.equal(auths.length,1,'Missing or duplicate execution authorization');const auth=auths[0];assert.equal(auth.sequence,1965);assert.equal(auth.previousHash,P.authorizationHash);assert.deepEqual(auth,latest.authorization);
  assert.deepEqual(auth.data,{amendmentHash:latest.amendmentHash,amendmentPath:latest.amendmentPath,previousRecoveryHash:P.recoveryHash,executionSourceDigest:r.processingBuild.sourceDigest,leaseReconciliationRef:auth.data.leaseReconciliationRef});
  for(const row of rows.filter(row=>row.sequence>1964)){
    if(active)assert.ok(row.kind!=='pause'&&row.kind!=='resume'&&row.data?.fatal!==true,'Later pause, resume or fatal prevents execution');
    assert.ok(!row.kind.endsWith('-authorized')||row.kind===validationExecutionAuthorizationKind,'Competing authorization prevents execution');
  }
  const claims=rows.filter(row=>row.kind==='review-dispatch-claimed'&&row.data.reviewId===P.reviewId);assert.ok(claims.length===1||claims.length===2,'Target attempt cap exceeded');assert.deepEqual(bind(claims[0]),{sequence:1960,hash:P.firstClaimHash});
  if(claims.length===2)assert.ok(claims[1].sequence>auth.sequence,'Second claim predates execution authorization');
  return{paused:false,remainingTargetCalls:2-claims.length};
}
export function assertValidationExecutionState(c,latest,state=c.state()){return assertExecutionRows(c,latest,state,true);}
export function readLatestValidationExecutionAmendment(c,{deep=false}={}){
  const rows=readJournal(c.root),events=rows.filter(r=>r.kind===validationExecutionAuthorizationKind);if(!events.length)return null;assert.equal(events.length,1,'Duplicate execution authorization');
  const authorization=events[0];hash(authorization.data.amendmentHash);const amendmentHash=authorization.data.amendmentHash,amendmentPath='private/validation-execution/amendments/'+amendmentHash+'.json';assert.equal(authorization.data.amendmentPath,amendmentPath);
  const amendment=readExecutionArtifact(c.root,{path:amendmentPath,sha256:amendmentHash});validateValidationExecutionRecord(c,amendment);
  const latest={amendment,amendmentHash,amendmentPath,authorization};assertExecutionRows(c,latest,{rows},false);
  const reconciliation=readExecutionArtifact(c.root,authorization.data.leaseReconciliationRef);strict(reconciliation,['schemaVersion','previousBoundary','expectedLease','sourceReviewHash','processObservation','observedAt','action']);assert.equal(reconciliation.schemaVersion,'trix-validation-execution-lease-reconciliation-1.0.0');assert.equal(reconciliation.action,'authorize-exact-dead-lease-removal');assert.ok(Number.isFinite(Date.parse(reconciliation.observedAt)));assert.deepEqual(reconciliation.expectedLease,amendment.staleLease);assert.deepEqual(reconciliation.previousBoundary,originalBoundary);assert.equal(reconciliation.sourceReviewHash,amendment.evidence.sourceReviewRef.sha256);assert.deepEqual(reconciliation.processObservation,{pid:P.leasePid,present:false,positiveAbsence:true});
  if(deep)verifyExecutionStaticInputs(c,latest,{deep:true});return latest;
}

// Same original lock path, exclusive acquisition, no generic stale-lock deletion.
export function withValidationExecutionOwnerLock(root,work){
  const path=safePath(root,'private/owner.lock'),bytes=jsonBytes({pid:process.pid,createdAt:new Date().toISOString(),validationExecutionNonce:randomUUID()});
  const fd=openSync(path,'wx');let result;
  try{writeFileSync(fd,bytes);fsyncSync(fd);result=sync(work());}
  finally{closeSync(fd);assert.ok(readFileSync(path).equals(bytes),'Owner lock identity changed; refuse cleanup');unlinkSync(path);}
  return result;
}
function positiveAbsence(pid){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return{pid,present:false,positiveAbsence:true};throw error;}throw Error('Pinned worker PID is live; reconciliation refused');}
export function validateValidationExecutionStaleLeaseBytes(bytes,record){assert.equal(record.staleLease.sha256,P.leaseHash);assert.deepEqual(record.staleLease.value,{pid:P.leasePid,startedAt:P.leaseStartedAt,worker:'full-campaign',reviewStartupRpcRecoveryHash:P.recoveryHash});assert.equal(sha(bytes),P.leaseHash,'Driver lease bytes changed');assert.deepEqual(JSON.parse(bytes),record.staleLease.value);}
function checkStaleLease(root,record){validateValidationExecutionStaleLeaseBytes(readFileSync(safePath(root,record.staleLease.path)),record);return positiveAbsence(P.leasePid);}
export function assertValidationExecutionPreparation(c,record){
  validateValidationExecutionRecord(c,record);const state=c.state();assert.deepEqual(bind(state.rows.at(-1)),originalBoundary);assert.equal(sha(readFileSync(safePath(c.root,'private/journal.jsonl'))),P.journalHash);assert.ok(!state.pending&&!state.claimed&&!state.intent&&!state.response);assert.equal(state.rows.filter(r=>r.kind==='review-dispatch-claimed'&&r.data.reviewId===P.reviewId).length,1);verifyExecutionPreservation(c,record,{state,preparation:true});return state;
}
export function describeValidationExecutionCandidate(c,{evidence,routingChanges={}}={}){
  const original=readValidationExecutionOriginal(c),hashes=sourceHashes();
  const record={schemaVersion:validationExecutionVersion,runId:P.runId,createdAt:new Date().toISOString(),previousBoundary:originalBoundary,physicalPrefix:{sha256:P.journalHash,rows:1964,lastHash:P.authorizationHash},originalRecoveryDelegation:{recoveryHash:P.recoveryHash,recoveryPath:originalPath,authorization:originalBoundary,processingBuild:original.recovery.processingBuild,sourceHashes:original.recovery.sourceHashes},processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:P.binaryDigest},sourceHashes:hashes,helperPins:Object.fromEntries(Object.entries(validationExecutionHelperFiles).map(([name,path])=>[name,{path,sha256:hashes[path]}])),nodeExecutable:{path:normalized(realpathSync(process.execPath)),sha256:sha(readFileSync(process.execPath)),version:process.version,platform:process.platform,arch:process.arch},hostExecutable:{path:normalized(original.recovery.inventory.audit.hostExecutable),sha256:original.recovery.inventory.audit.executableHash},runtimeIdentity:{root:normalized(c.root),cwd:normalized(process.cwd()),execArgv:[],environment:{NODE_OPTIONS:null,NODE_PATH:null}},routingChanges:clone(routingChanges),evidence:clone(evidence),staleLease:{path:'private/driver.lock',sha256:P.leaseHash,value:{pid:P.leasePid,startedAt:P.leaseStartedAt,worker:'full-campaign',reviewStartupRpcRecoveryHash:P.recoveryHash}},attemptPolicy:{reviewId:P.reviewId,firstClaim:{sequence:1960,hash:P.firstClaimHash},remainingSecond:1,maxTargetClaims:2,ordinaryAttemptCap:2,absoluteDeadlineMs:300000,extraAllowance:0},epochPolicy:{invocationFile:'private/validation-execution.json',publicationFile:'validation-execution-epoch.json',historicalPublications:'preserve-exact-inventory-and-bytes'}};
  validateValidationExecutionRecord(c,record);return record;
}
export async function prepareValidationExecutionAmendment(c,{candidate,sourceReviewHash}={}){
  assert.ok(candidate,'Reviewed immutable candidate required');hash(sourceReviewHash);assert.equal(candidate.evidence.sourceReviewRef.sha256,sourceReviewHash,'Independent source review hash required');
  const existing=readLatestValidationExecutionAmendment(c);if(existing){assertValidationExecutionState(c,existing,c.state());assert.deepEqual(executionSourceReviewBinding(existing.amendment),executionSourceReviewBinding(candidate));assert.equal(existing.amendment.evidence.sourceReviewRef.sha256,sourceReviewHash);return{...existing,alreadyPrepared:true};}
  assertValidationExecutionPreparation(c,candidate);verifyExecutionStaticInputs(c,candidate,{sourceRoot:repository,deep:true});
  const original=await loadValidationExecutionOriginal(c);assert.deepEqual(original.frozen.readLatestReviewStartupRpcRecovery(c),original.latest);
  const runtime=await import('./validation-execution-runtime.mjs');assert.equal(typeof runtime.preflightValidationExecutionRuntime,'function');
  const preflight=await runtime.preflightValidationExecutionRuntime(c,original.latest,original.frozen,{candidateAmendment:candidate});assert.equal(preflight.modelCalls,0);assert.equal(preflight.journalMutation,false);
  return withValidationExecutionOwnerLock(c.root,()=>{
    assertValidationExecutionPreparation(c,candidate);verifyExecutionStaticInputs(c,candidate,{sourceRoot:repository,deep:true});assert.deepEqual(original.frozen.readLatestReviewStartupRpcRecovery(c),original.latest);
    const processObservation=checkStaleLease(c.root,candidate);
    preserveBuild(c.root,repository,candidate.sourceHashes,candidate.processingBuild,original.build.binaryPath);
    const reconciliation={schemaVersion:'trix-validation-execution-lease-reconciliation-1.0.0',previousBoundary:originalBoundary,expectedLease:candidate.staleLease,sourceReviewHash,processObservation,observedAt:new Date().toISOString(),action:'authorize-exact-dead-lease-removal'};
    const reconciliationHash=sha(jsonBytes(reconciliation)),leaseReconciliationRef={path:'private/validation-execution/lease-reconciliations/'+reconciliationHash+'.json',sha256:reconciliationHash};writeImmutable(safePath(c.root,leaseReconciliationRef.path),jsonBytes(reconciliation));
    const amendmentHash=sha(jsonBytes(candidate)),amendmentPath='private/validation-execution/amendments/'+amendmentHash+'.json';writeImmutable(safePath(c.root,amendmentPath),jsonBytes(candidate));
    appendEvent(c.root,validationExecutionAuthorizationKind,{amendmentHash,amendmentPath,previousRecoveryHash:P.recoveryHash,executionSourceDigest:candidate.processingBuild.sourceDigest,leaseReconciliationRef});
    // Authorization records exact reconciliation first. A crash leaves an exact
    // recoverable old lease; acquisition rechecks its bytes and fresh absence.
    checkStaleLease(c.root,candidate);unlinkSync(safePath(c.root,candidate.staleLease.path));
    return{...readLatestValidationExecutionAmendment(c),alreadyPrepared:false};
  });
}
export function acquireValidationExecutionDriverLease(c,latest){
  return withValidationExecutionOwnerLock(c.root,()=>{
    assert.deepEqual(readLatestValidationExecutionAmendment(c),latest);verifyExecutionStaticInputs(c,latest);assertValidationExecutionState(c,latest,c.state());
    const path=safePath(c.root,'private/driver.lock');
    if(existsSync(path)){checkStaleLease(c.root,latest.amendment);unlinkSync(path);}
    const lease={pid:process.pid,startedAt:new Date().toISOString(),processUptimeSeconds:process.uptime(),worker:'validation-execution-full-campaign',nonce:randomUUID(),validationExecutionAmendmentHash:latest.amendmentHash,executionSourceDigest:latest.amendment.processingBuild.sourceDigest,nodeExecutable:latest.amendment.nodeExecutable};
    const bytes=jsonBytes(lease),fd=openSync(path,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
    return()=>withValidationExecutionOwnerLock(c.root,()=>{assert.ok(readFileSync(path).equals(bytes),'Driver lease identity changed; refuse cleanup');unlinkSync(path);});
  });
}
