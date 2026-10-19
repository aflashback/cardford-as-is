// Process-local exact-current-head validation. A certificate is never admission authority.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {jsonBytes,sha,safePath} from './journal.mjs';
import {verifyCurrentLoaderCertificate} from './validation-execution-certificate.mjs';
import {readLatestValidationExecutionAmendment,readValidationExecutionOriginal,assertValidationExecutionState,verifyExecutionStaticInputs} from './validation-execution-amendment.mjs';
export const validationExecutionProviderSourceHash=sha(readFileSync(new URL(import.meta.url)));
const sync=value=>{assert.ok(!value||typeof value.then!=='function','Execution validation must be synchronous');return value};
const clone=value=>JSON.parse(JSON.stringify(value));
const normalized=path=>resolve(path).replaceAll('\\','/');
const helperRoot=dirname(fileURLToPath(import.meta.url));
export function validationExecutionCaptureBudget(bare,now=Date.now()){
  let timeout=90000;
  for(const row of bare.state().rows.filter(r=>['dispatch-claimed','review-dispatch-claimed'].includes(r.kind))){const id=row.data.job?.jobId??row.data.jobId;if(existsSync(safePath(bare.root,'private/invocations/'+id+'/private/app-server/stopped.json')))continue;const deadline=Date.parse(row.data.job?.deadlineAt??row.data.deadlineAt);assert.ok(Number.isFinite(deadline),'Active claim has no finite original deadline');timeout=Math.min(timeout,deadline-now);}
  assert.ok(timeout>0,'Original invocation deadline elapsed before validation');return Math.floor(timeout);
}
function pinnedInput(bare,original,execution,state,journalHash){
  const r=execution.amendment,pins=r.helperPins;
  return{root:normalized(bare.root),sourceRoot:normalized(resolve(bare.root,'builds',original.recovery.processingBuild.sourceDigest,original.recovery.processingBuild.binaryDigest,'source')),sourceHashes:original.recovery.sourceHashes,sourcePins:original.recovery.processingBuild,loaderSourceHash:original.recovery.sourceHashes['scripts/trix-scenario-collection/review-startup-rpc-recovery.mjs'],trackerSourceHash:pins.footprint.sha256,captureChildSourceHash:pins.capture.sha256,certificateVerifierSourceHash:pins.certificate.sha256,nodeExecutableHash:r.nodeExecutable.sha256,journalHash,journalBoundary:{sequence:state.rows.at(-1)?.sequence??0,hash:state.rows.at(-1)?.hash??'0'.repeat(64)},recoveryHash:original.recoveryHash};
}
function capture(bare,execution,input){
  // Only this audit-only child instruments FS. The live runtime never patches globals.
  const record=execution.amendment;
  assert.deepEqual(process.execArgv,[],'Unadmitted Node arguments');assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'Ambient Node bootstrap options forbidden');
  assert.equal(sha(readFileSync(process.execPath)),record.nodeExecutable.sha256);
  for(const name of ['footprint','certificate','capture','provider'])assert.equal(sha(readFileSync(resolve(helperRoot,'validation-execution-'+name+'.mjs'))),record.helperPins[name].sha256,'Loaded execution helper changed');
  const directory=safePath(bare.root,'private/validation-execution/diagnostics/'+randomUUID());mkdirSync(directory,{recursive:true});
  const inputPath=resolve(directory,'input.json');writeFileSync(inputPath,jsonBytes(input),{flag:'wx'});
  const timeout=validationExecutionCaptureBudget(bare);
  const result=spawnSync(process.execPath,[resolve(helperRoot,'validation-execution-capture.mjs'),inputPath],{cwd:record.runtimeIdentity.cwd,env:{...process.env},timeout,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024});
  writeFileSync(resolve(directory,'stdout.txt'),result.stdout??'',{flag:'wx'});writeFileSync(resolve(directory,'stderr.txt'),result.stderr??'',{flag:'wx'});
  writeFileSync(resolve(directory,'result.json'),jsonBytes({status:result.status,signal:result.signal,error:result.error?{code:result.error.code,message:result.error.message}:null,inputHash:sha(jsonBytes(input)),timeoutMs:timeout}),{flag:'wx'});
  assert.equal(result.error,undefined,'Cold audit failed: '+result.error?.message);assert.equal(result.status,0,'Cold audit rejected: '+(result.stdout??result.stderr));
  const output=JSON.parse(result.stdout);assert.equal(output.status,'captured-original-full-reader');return{...output,inputPath};
}
export function verifyValidationExecutionCapture(output,input,execution){
  const certificate=output.certificate,inputBytes=jsonBytes(input),r=execution.amendment;
  assert.equal(certificate.inputHash,sha(inputBytes),'Captured audit input differs from parent-prepared bytes');
  assert.equal(certificate.captureChildSourceHash,r.helperPins.capture.sha256,'Captured child differs from admitted helper');
  assert.equal(input.captureChildSourceHash,r.helperPins.capture.sha256);assert.equal(input.trackerSourceHash,r.helperPins.footprint.sha256);assert.equal(input.certificateVerifierSourceHash,r.helperPins.certificate.sha256);assert.equal(input.nodeExecutableHash,r.nodeExecutable.sha256);
  assert.equal(typeof output.inputPath,'string','Parent-prepared input path required');
  const anchors=[[normalized(output.inputPath),sha(inputBytes),inputBytes.length],[normalized(process.execPath),r.nodeExecutable.sha256]];
  for(const name of ['capture','footprint','certificate'])anchors.push([normalized(resolve(helperRoot,'validation-execution-'+name+'.mjs')),r.helperPins[name].sha256]);
  for(const[path,hash,length]of anchors){const reads=certificate.footprint.effects.filter(e=>e.kind==='readFile'&&e.path===path);assert.ok(reads.length>0,'Captured read footprint omits pinned parent input/helper: '+path);for(const effect of reads){assert.equal(effect.sha256,hash,'Captured parent input/helper byte hash changed');if(length!==undefined)assert.equal(effect.bytes,length,'Captured parent input byte length changed');}}
}
export function createValidationExecutionProvider(bare,originalLatest,frozen,executionLatest,{dependencies={}}={}){
  // Dependency seams are for bounded synthetic composition; CLI does not forward them.
  const dep={readExecution:readLatestValidationExecutionAmendment,readOriginal:readValidationExecutionOriginal,assertExecution:assertValidationExecutionState,verifyStatic:verifyExecutionStaticInputs,capture:input=>capture(bare,executionLatest,input),verifyCertificate:verifyCurrentLoaderCertificate,makeInput:(state,journalHash)=>pinnedInput(bare,originalLatest,executionLatest,state,journalHash),...dependencies};
  for(const value of Object.values(dep))assert.equal(typeof value,'function');
  assert.equal(typeof frozen.assertReviewStartupRpcState,'function');
  const identity={root:normalized(bare.root),sourceRoot:normalized(bare.sourceRoot),templateRoot:normalized(bare.templateRoot),manifest:clone(bare.manifest),native:bare.native,state:bare.state},original=clone(originalLatest),execution=clone(executionLatest),metrics={captures:0,rechecks:0};let cached=null;
  function checkOwner(owner){for(const key of ['root','sourceRoot','templateRoot'])assert.equal(normalized(owner[key]),identity[key],`Collector ${key} changed`);assert.deepEqual(owner.manifest,identity.manifest,'Collector manifest changed');assert.equal(owner.native,identity.native,'Collector native changed');assert.equal(bare.state,identity.state,'Bare state changed');assert.deepEqual(originalLatest,original,'Original expected identity changed');assert.deepEqual(executionLatest,execution,'Execution expected identity changed');}
  function state(owner=bare){checkOwner(owner);checkOwner(bare);const current=sync(bare.state()),view=Object.create(bare);view.state=()=>current;
    assert.deepEqual(sync(dep.readExecution(view)),execution,'Execution authority changed');assert.deepEqual(sync(dep.readOriginal(view)),original,'Original authority changed');
    const dynamic=sync(frozen.assertReviewStartupRpcState(view,original,current));sync(dep.assertExecution(view,execution,current));assert.equal(dynamic.paused,false,'Later pause prevents execution');return{...current,paused:false};}
  function validateCurrent(owner=bare){const current=state(owner),physical=readFileSync(safePath(bare.root,'private/journal.jsonl')),journalHash=sha(physical);assert.equal(journalHash,sha(Buffer.concat(current.rows.map(jsonBytes))),'Physical journal is not canonical current state');const view=Object.create(bare);view.state=()=>current;
    assert.ok(sync(dep.verifyStatic(view,execution)),'Execution static verification required');
    if(!cached||cached.certificate.journalHash!==journalHash){cached=null;const input=clone(sync(dep.makeInput(current,journalHash))),preparedInput=clone(input);const output=sync(dep.capture(input));assert.equal(output.status,'captured-original-full-reader');assert.deepEqual(output.certificate.result,original,'Cold original semantic identity changed');assert.equal(output.certificate.journalHash,journalHash,'Cold capture head changed');assert.equal(output.certificateHash,sha(jsonBytes(output.certificate)));verifyValidationExecutionCapture(output,preparedInput,execution);cached={...output,parentInput:preparedInput,parentInputPath:output.inputPath};metrics.captures++;}
    verifyValidationExecutionCapture({...cached,inputPath:cached.parentInputPath},cached.parentInput,execution);
    const certificate=cached.certificate,result=sync(dep.verifyCertificate(certificate,{certificateBytes:jsonBytes(certificate),expectedCertificateHash:cached.certificateHash,expectedLoaderHash:original.recovery.sourceHashes['scripts/trix-scenario-collection/review-startup-rpc-recovery.mjs'],expectedTrackerHash:execution.amendment.helperPins.footprint?.sha256,expectedLatest:original,expectedNonFsInputs:certificate.nonFsInputs,bareCollector:bare,readCurrentState:()=>state(bare),assertCurrentState:(c,latest,s)=>{const d=sync(frozen.assertReviewStartupRpcState(c,latest,s));sync(dep.assertExecution(c,execution,s));return d}}));
    assert.ok(sync(dep.verifyStatic(view,execution)),'Execution static verification required after capture and footprint recheck');assert.equal(sha(readFileSync(safePath(bare.root,'private/journal.jsonl'))),journalHash,'Physical head changed during critical verification');assert.deepEqual(sync(dep.readExecution(bare)),execution,'Execution authority changed');metrics.rechecks++;return result;
  }
  return{state,validateCurrent,loadLatest:owner=>validateCurrent(owner).latest,checkOwner,metrics};
}
