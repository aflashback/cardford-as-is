// Copied-ledger and temporary-file tests. No live prepare/admission/lease/process/model/native action.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {sourceDigest} from '../coach-lab-builds.mjs';
import {Collector} from './runner.mjs';
import {jsonBytes,sha,readJournal,appendEvent,safePath,putBlob,getBlob} from './journal.mjs';
import {validationExecutionPins as P,validationExecutionSourceHash,validationExecutionVersion,validationExecutionAuthorizationKind,validationExecutionHelperFiles,readValidationExecutionOriginal,validateValidationExecutionRecord,readLatestValidationExecutionAmendment,assertValidationExecutionState,executionSourceReviewBinding,verifyExecutionSourceReplacements,inventoryExecutionDirectory,withValidationExecutionOwnerLock,validateValidationExecutionStaleLeaseBytes,verifyExecutionPreservation,assertValidationExecutionNativeCheckpoint} from './validation-execution-amendment.mjs';
const actual=resolve('.local/evaluation/trix-scenarios/trix-luna-20261011-pilot');
const originalPath='private/review-startup-rpc/recoveries/'+P.recoveryHash+'.json';
// Source evidence only: these three original files are read once and copied.
const originals=Object.fromEntries(['manifest.json','private/journal.jsonl',originalPath].map(path=>[path,readFileSync(safePath(actual,path))]));
const h=value=>sha(String(value)),clone=v=>JSON.parse(JSON.stringify(v)),norm=p=>resolve(p).replaceAll('\\','/');
function put(root,path,bytes){const absolute=safePath(root,path);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,bytes);}
function temp(t){const root=mkdtempSync(resolve(tmpdir(),'trix-validation-amendment-'));t.after(()=>{assert.equal(dirname(root),resolve(tmpdir()));assert.ok(basename(root).startsWith('trix-validation-amendment-'));rmSync(root,{recursive:true,force:true});});return root;}
function fixture(t){
  const root=temp(t);for(const [path,bytes]of Object.entries(originals))put(root,path,bytes);
  const c={root,manifest:JSON.parse(originals['manifest.json']),state:()=>({rows:readJournal(root)})};
  const original=readValidationExecutionOriginal(c),old=original.recovery,hashes={...old.sourceHashes,...Object.fromEntries(Object.values(validationExecutionHelperFiles).map(path=>[path,path.endsWith('/validation-execution-amendment.mjs')?validationExecutionSourceHash:h(path)]))};
  const ref=name=>({path:'reports/'+name+'.json',sha256:h(name)});
  const evidence={historicalBaselineRef:{path:'reports/original-baseline.json',sha256:P.historicalBaselineHash},preservationBaselineRef:{path:'reports/new-baseline.json',sha256:P.preservationBaselineHash},stopReportRef:ref('stop'),stopAuditRef:{path:'reports/audit.json',sha256:P.stopAuditHash},guardDiagnosisRef:ref('guard-diagnosis'),snapshotDiagnosisRef:ref('snapshot-diagnosis'),sourceReviewRef:ref('source-review'),captureMeasurementRef:ref('measurement')};
  const record={schemaVersion:validationExecutionVersion,runId:P.runId,createdAt:'2026-10-13T05:00:00.000Z',previousBoundary:{sequence:1964,hash:P.authorizationHash},physicalPrefix:{sha256:P.journalHash,rows:1964,lastHash:P.authorizationHash},originalRecoveryDelegation:{recoveryHash:P.recoveryHash,recoveryPath:originalPath,authorization:{sequence:1964,hash:P.authorizationHash},processingBuild:old.processingBuild,sourceHashes:old.sourceHashes},processingBuild:{sourceDigest:sourceDigest(hashes),binaryDigest:P.binaryDigest},sourceHashes:hashes,helperPins:Object.fromEntries(Object.entries(validationExecutionHelperFiles).map(([name,path])=>[name,{path,sha256:hashes[path]}])),nodeExecutable:{path:norm(process.execPath),sha256:h('node'),version:process.version,platform:process.platform,arch:process.arch},hostExecutable:{path:norm(old.inventory.audit.hostExecutable),sha256:old.inventory.audit.executableHash},runtimeIdentity:{root:norm(root),cwd:norm(process.cwd()),execArgv:[],environment:{NODE_OPTIONS:null,NODE_PATH:null}},routingChanges:{},evidence,staleLease:{path:'private/driver.lock',sha256:P.leaseHash,value:{pid:P.leasePid,startedAt:P.leaseStartedAt,worker:'full-campaign',reviewStartupRpcRecoveryHash:P.recoveryHash}},attemptPolicy:{reviewId:P.reviewId,firstClaim:{sequence:1960,hash:P.firstClaimHash},remainingSecond:1,maxTargetClaims:2,ordinaryAttemptCap:2,absoluteDeadlineMs:300000,extraAllowance:0},epochPolicy:{invocationFile:'private/validation-execution.json',publicationFile:'validation-execution-epoch.json',historicalPublications:'preserve-exact-inventory-and-bytes'}};
  const activate=()=>{
    const amendmentHash=sha(jsonBytes(record)),amendmentPath='private/validation-execution/amendments/'+amendmentHash+'.json';put(root,amendmentPath,jsonBytes(record));
    const receipt={schemaVersion:'trix-validation-execution-lease-reconciliation-1.0.0',previousBoundary:record.previousBoundary,expectedLease:record.staleLease,sourceReviewHash:record.evidence.sourceReviewRef.sha256,processObservation:{pid:P.leasePid,present:false,positiveAbsence:true},observedAt:record.createdAt,action:'authorize-exact-dead-lease-removal'},receiptBytes=jsonBytes(receipt),leaseReconciliationRef={path:'private/validation-execution/fixture-reconciliation.json',sha256:sha(receiptBytes)};put(root,leaseReconciliationRef.path,receiptBytes);
    const authorization=appendEvent(root,validationExecutionAuthorizationKind,{amendmentHash,amendmentPath,previousRecoveryHash:P.recoveryHash,executionSourceDigest:record.processingBuild.sourceDigest,leaseReconciliationRef});return{amendment:record,amendmentHash,amendmentPath,authorization};
  };
  return{root,c,record,original,activate};
}
test('preparation preserves the actual completed native game with null active Collector frame',t=>{
  const f=fixture(t),historicalPath='reports/review-startup-rpc-preservation-baseline-20261012.json',baselinePath='reports/validation-execution-preservation-baseline-20261013.json';
  const historicalBytes=readFileSync(safePath(actual,historicalPath)),baselineBytes=readFileSync(safePath(actual,baselinePath)),baseline=JSON.parse(baselineBytes);
  for(const path of Object.keys(baseline.files))put(f.root,path,readFileSync(safePath(actual,path)));
  put(f.root,historicalPath,historicalBytes);put(f.root,baselinePath,baselineBytes);
  f.record.evidence.historicalBaselineRef={path:historicalPath,sha256:sha(historicalBytes)};f.record.evidence.preservationBaselineRef={path:baselinePath,sha256:sha(baselineBytes)};
  f.c.state=()=>Collector.prototype.state.call(f.c);const state=f.c.state();
  assert.equal(state.episode,null);assert.equal(state.frameRef,null);assert.equal(state.rows.find(r=>r.sequence===1951).kind,'episode-completed');
  const before=readFileSync(safePath(f.root,'private/journal.jsonl'));
  verifyExecutionPreservation(f.c,f.record,{state,preparation:true});
  assert.ok(readFileSync(safePath(f.root,'private/journal.jsonl')).equals(before));assert.equal(existsSync(safePath(f.root,'private/owner.lock')),false);
});
function checkpointFixture(t){
  const f=fixture(t),baseline=JSON.parse(readFileSync(safePath(actual,'reports/review-startup-rpc-preservation-baseline-20261012.json')));
  const state=Collector.prototype.state.call(f.c),last=state.rows.find(r=>r.sequence===1950),completed=state.rows.find(r=>r.sequence===1951);
  for(const ref of [last.data.frameRef,completed.data.outcomeRef])put(f.root,ref.path,readFileSync(safePath(actual,ref.path)));
  return{...f,baseline,state,last,completed};
}
test('checkpoint guard binds authentic completed frame, outcome, digest and revision without native execution',t=>{
  const f=checkpointFixture(t);assert.equal(f.state.frameRef,null);assertValidationExecutionNativeCheckpoint(f.c,f.state,f.baseline);
});
for(const [name,edit]of [
  ['null frame for active episode',f=>f.state.episode={episodeId:'basic-solo-4'}],
  ['active frame after completion',f=>{f.state.frameRef=f.last.data.frameRef;f.state.episode={episodeId:'basic-solo-4'};}],
  ['missing completion',f=>f.state.rows=f.state.rows.filter(r=>r.sequence!==1951)],
  ['abandoned completion',f=>f.completed.kind='episode-abandoned'],
  ['completion before last commit',f=>f.completed.sequence=1949],
  ['wrong episode',f=>f.completed.data.episodeId='another-episode'],
  ['wrong request',f=>f.completed.data.request='king'],
  ['wrong family',f=>f.completed.data.familyId=h('another-family')],
  ['wrong completed frame',f=>f.completed.data.frameRef={path:'blobs/'+h('wrong'),sha256:h('wrong')}],
  ['wrong terminal outcome',f=>f.completed.data.outcomeRef=putBlob(f.root,{substituted:true})],
  ['duplicate completion',f=>f.state.rows.push({...clone(f.completed),sequence:1965})],
  ['later episode start',f=>f.state.rows.push({sequence:1965,kind:'episode-started',data:{episode:{episodeId:'basic-solo-5'}}})],
  ['later native preparation',f=>f.state.rows.push({sequence:1965,kind:'job-prepared',data:{jobId:'another-player'}})],
  ['mismatched native digest',f=>f.baseline.currentNativeFrame.nativeAfterDigest=h('wrong-native')],
  ['mismatched native revision',f=>f.baseline.currentNativeFrame.revision=55],
])test('preparation checkpoint rejects '+name,t=>{const f=checkpointFixture(t);edit(f);assert.throws(()=>assertValidationExecutionNativeCheckpoint(f.c,f.state,f.baseline));});
test('active checkpoint requires its exact episode start and frame; null cannot substitute for it',t=>{
  const f=checkpointFixture(t);f.state.rows=f.state.rows.filter(r=>r.sequence<1951);const start=f.state.rows.filter(r=>r.kind==='episode-started').at(-1);
  f.state.episode=start.data.episode;f.state.frameRef=f.last.data.frameRef;assertValidationExecutionNativeCheckpoint(f.c,f.state,f.baseline);
  f.state.frameRef=null;assert.throws(()=>assertValidationExecutionNativeCheckpoint(f.c,f.state,f.baseline));
});
test('even an authenticated replacement terminal blob cannot alter saved revision or snapshot',t=>{
  for(const field of ['revision','snapshot']){
    const f=checkpointFixture(t),frame=getBlob(f.root,f.last.data.frameRef);if(field==='revision')frame.revision++;else frame.snapshot={substituted:true};
    const changed=putBlob(f.root,frame);f.baseline.currentNativeFrame.frameRef=changed;f.last.data.frameRef=changed;f.completed.data.frameRef=changed;
    assert.throws(()=>assertValidationExecutionNativeCheckpoint(f.c,f.state,f.baseline));
  }
});
test('copied original ledger exposes exact untouched TSC25 identity and no new amendment',t=>{
  const f=fixture(t);assert.equal(f.original.recoveryHash,P.recoveryHash);assert.equal(f.original.authorization.sequence,1964);assert.equal(sha(readFileSync(safePath(f.root,'private/journal.jsonl'))),P.journalHash);assert.equal(readLatestValidationExecutionAmendment(f.c),null);validateValidationExecutionRecord(f.c,f.record);
});
test('prospective amendment at 1965 reads separately from original semantic latest',t=>{
  const f=fixture(t),expected=f.activate(),latest=readLatestValidationExecutionAmendment(f.c);assert.deepEqual(latest,expected);assert.notEqual(latest.amendment.processingBuild.sourceDigest,P.sourceDigest);assert.equal(readValidationExecutionOriginal(f.c).recovery.processingBuild.sourceDigest,P.sourceDigest);assert.equal(assertValidationExecutionState(f.c,latest).remainingTargetCalls,1);
});
test('read-only inspection can retrieve a paused amendment but active guard cannot resume it',t=>{
  const f=fixture(t),latest=f.activate();appendEvent(f.root,'pause',{reason:'fixture-stop'});assert.deepEqual(readLatestValidationExecutionAmendment(f.c),latest);assert.throws(()=>assertValidationExecutionState(f.c,latest),/Later pause/);
});
for(const [kind,data]of [['resume',{}],['attempt-settled',{fatal:true}],['other-recovery-authorized',{}]])test('new '+kind+' prevents active execution',t=>{const f=fixture(t),latest=f.activate();appendEvent(f.root,kind,data);assert.throws(()=>assertValidationExecutionState(f.c,latest),/Later pause|Competing authorization/);});
test('duplicate amendment authorization and mismatched immutable record are rejected',t=>{
  const f=fixture(t),latest=f.activate();appendEvent(f.root,validationExecutionAuthorizationKind,latest.authorization.data);assert.throws(()=>readLatestValidationExecutionAmendment(f.c),/Duplicate execution/);
  const g=fixture(t),other=g.activate();put(g.root,other.amendmentPath,jsonBytes({...g.record,createdAt:'2026-10-13T06:00:00.000Z'}));assert.throws(()=>readLatestValidationExecutionAmendment(g.c),/Immutable execution evidence/);
});
test('an intervening physical row cannot move prospective authorization to 1966',t=>{const f=fixture(t);appendEvent(f.root,'fixture-intervening',{});f.activate();assert.throws(()=>readLatestValidationExecutionAmendment(f.c),/1966 !== 1965/);});
test('exact second claim exhausts allowance; third claim is rejected',t=>{
  const f=fixture(t),latest=f.activate();appendEvent(f.root,'review-dispatch-claimed',{reviewId:P.reviewId,job:{jobId:'fixture-second'}});assert.equal(assertValidationExecutionState(f.c,latest).remainingTargetCalls,0);appendEvent(f.root,'review-dispatch-claimed',{reviewId:P.reviewId,job:{jobId:'fixture-third'}});assert.throws(()=>assertValidationExecutionState(f.c,latest),/Target attempt cap/);
});
for(const [name,edit]of [
  ['extra attempt',r=>r.attemptPolicy.extraAllowance=1],['extended deadline',r=>r.attemptPolicy.absoluteDeadlineMs=600000],['native replacement',r=>r.processingBuild.binaryDigest=h('new native')],['Node preload',r=>r.runtimeIdentity.environment.NODE_OPTIONS='--import evil.mjs'],['wrong new baseline',r=>r.evidence.preservationBaselineRef.sha256=h('another baseline')],['wrong helper',r=>r.helperPins.capture.sha256=h('new capture')],['wrong root',r=>r.runtimeIdentity.root='C:/elsewhere'],
])test('record schema rejects '+name,t=>{const f=fixture(t);edit(f.record);assert.throws(()=>validateValidationExecutionRecord(f.c,f.record));});
test('frozen manager/runner/transport source cannot use a routing exception',t=>{
  const f=fixture(t),path='scripts/trix-scenario-collection/runner.mjs';f.record.sourceHashes[path]=h('changed');f.record.processingBuild.sourceDigest=sourceDigest(f.record.sourceHashes);assert.throws(()=>validateValidationExecutionRecord(f.c,f.record),/Original semantic source changed/);
  f.record.routingChanges[path]={previousSha256:f.original.recovery.sourceHashes[path],nextSha256:h('changed'),patchRef:{path:'reports/patch.json',sha256:h('patch')}};assert.throws(()=>validateValidationExecutionRecord(f.c,f.record),/Unapproved source replacement/);
});

test('every runtime helper must exist in the admitted source closure',t=>{
  const f=fixture(t),path=validationExecutionHelperFiles.capture;delete f.record.sourceHashes[path];f.record.helperPins.capture={path,sha256:undefined};f.record.processingBuild.sourceDigest=sourceDigest(f.record.sourceHashes);assert.throws(()=>validateValidationExecutionRecord(f.c,f.record));
});
test('both exact routing exceptions need reviewed old/new byte hashes and matching patch bytes',t=>{
  const f=fixture(t);for(const path of ['scripts/trix-scenario-collection.mjs','planning/implementation/coach-lab/trix-scenario-collection/README.md']){
    const old=readFileSync(resolve(actual,'builds',P.sourceDigest,P.binaryDigest,'source',path)),next=Buffer.concat([old,Buffer.from('\nfixture reviewed addition\n')]);
    const patch={schemaVersion:'trix-reviewed-source-replacement-1.0.0',path,previousSha256:sha(old),nextSha256:sha(next),previousBytesBase64:old.toString('base64'),nextBytesBase64:next.toString('base64')},bytes=jsonBytes(patch),patchRef={path:'reports/patch-'+Object.keys(f.record.routingChanges).length+'.json',sha256:sha(bytes)};put(f.root,patchRef.path,bytes);
    f.record.sourceHashes[path]=sha(next);f.record.routingChanges[path]={previousSha256:sha(old),nextSha256:sha(next),patchRef};
  }
  f.record.processingBuild.sourceDigest=sourceDigest(f.record.sourceHashes);validateValidationExecutionRecord(f.c,f.record);verifyExecutionSourceReplacements(f.c,f.record);
  const ref=Object.values(f.record.routingChanges)[0].patchRef;put(f.root,ref.path,Buffer.from('{}\n'));assert.throws(()=>verifyExecutionSourceReplacements(f.c,f.record),/Immutable execution evidence/);
});
test('source review binding includes all graphs, source replacements, baseline and runtime inputs without a self-reference',t=>{
  const f=fixture(t),binding=executionSourceReviewBinding(f.record);assert.equal(binding.createdAt,undefined);assert.equal(binding.evidence.sourceReviewRef,undefined);assert.deepEqual(binding.evidence.preservationBaselineRef,f.record.evidence.preservationBaselineRef);assert.deepEqual(binding.sourceHashes,f.record.sourceHashes);assert.deepEqual(binding.runtimeIdentity,f.record.runtimeIdentity);assert.deepEqual(binding.routingChanges,f.record.routingChanges);
});
test('raw directory inventory detects unexpected files as well as changed bytes',t=>{
  const root=temp(t);put(root,'raw-games/episode/a.json',Buffer.from('one'));const before=inventoryExecutionDirectory(root,'raw-games/episode');put(root,'raw-games/episode/unexpected.json',Buffer.from('two'));assert.notDeepEqual(inventoryExecutionDirectory(root,'raw-games/episode'),before);
});
test('original owner-lock path is exclusive, synchronous and never generically deletes stale leases',t=>{
  const root=temp(t);mkdirSync(resolve(root,'private'));const owner=resolve(root,'private/owner.lock');
  const result=withValidationExecutionOwnerLock(root,()=>{assert.ok(existsSync(owner));assert.throws(()=>withValidationExecutionOwnerLock(root,()=>assert.fail('nested callback')),/EEXIST/);return 17;});assert.equal(result,17);assert.equal(existsSync(owner),false);
  put(root,'private/owner.lock',jsonBytes({pid:99999999,unknown:'preserve'}));const before=readFileSync(owner);assert.throws(()=>withValidationExecutionOwnerLock(root,()=>assert.fail('unknown owner callback')),/EEXIST/);assert.ok(readFileSync(owner).equals(before));
});
test('owner lock does not outlive a synchronous thrown validation and rejects asynchronous work',t=>{
  const root=temp(t);mkdirSync(resolve(root,'private'));assert.throws(()=>withValidationExecutionOwnerLock(root,()=>{throw Error('validation failed');}),/validation failed/);assert.equal(existsSync(resolve(root,'private/owner.lock')),false);assert.throws(()=>withValidationExecutionOwnerLock(root,async()=>{}),/synchronous/);assert.equal(existsSync(resolve(root,'private/owner.lock')),false);
});
test('only exact stopped 58200 lease bytes are eligible even before any process probe',t=>{
  const f=fixture(t),bytes=jsonBytes(f.record.staleLease.value);assert.equal(sha(bytes),P.leaseHash);validateValidationExecutionStaleLeaseBytes(bytes,f.record);
  assert.throws(()=>validateValidationExecutionStaleLeaseBytes(jsonBytes({...f.record.staleLease.value,pid:1}),f.record),/lease bytes changed/);
  const altered=clone(f.record);altered.staleLease.value.pid=1;altered.staleLease.sha256=sha(jsonBytes(altered.staleLease.value));assert.throws(()=>validateValidationExecutionStaleLeaseBytes(jsonBytes(altered.staleLease.value),altered));
});
