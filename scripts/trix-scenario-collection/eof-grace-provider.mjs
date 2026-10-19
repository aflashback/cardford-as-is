// Exact-current-head cold audit; the old loader result is never active authority.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {jsonBytes,sha,safePath} from './journal.mjs';
import {validationExecutionCaptureBudget} from './validation-execution-provider.mjs';
import {readEofGraceParent,readLatestEofGraceRecovery,assertEofGraceState,verifyEofGraceStaticInputs} from './eof-grace-recovery.mjs';
export const eofGraceProviderSourceHash=sha(readFileSync(new URL(import.meta.url)));
const norm=p=>resolve(p).replaceAll('\\','/'),clone=x=>JSON.parse(JSON.stringify(x));
const sync=x=>{assert.ok(!x||typeof x.then!=='function','EOF authority callback must be synchronous');return x};
export function createEofGraceProvider(bare,latest,original,frozen,parentModules,{dependencies={}}={}){
  const parent=readEofGraceParent(bare),r=latest.recovery,old=parent.amendment;
  const helperRoot=resolve(bare.root,'builds',old.processingBuild.sourceDigest,old.processingBuild.binaryDigest,'source/scripts/trix-scenario-collection');
  const expected=clone(latest),identity={root:norm(bare.root),sourceRoot:norm(bare.sourceRoot),templateRoot:norm(bare.templateRoot),manifest:clone(bare.manifest),native:bare.native,state:bare.state};let cached=null;
  const dep={readLatest:readLatestEofGraceRecovery,verifyStatic:verifyEofGraceStaticInputs,verifyCertificate:parentModules.certificate.verifyCurrentLoaderCertificate,verifyCapture:parentModules.provider.verifyValidationExecutionCapture,...dependencies};
  const metrics={captures:0,rechecks:0};
  function checkOwner(owner){for(const k of ['root','sourceRoot','templateRoot'])assert.equal(norm(owner[k]),identity[k],'Collector identity changed');assert.deepEqual(owner.manifest,identity.manifest);assert.equal(owner.native,identity.native);assert.equal(bare.state,identity.state);assert.deepEqual(latest,expected);}
  function state(owner=bare){checkOwner(owner);const s=sync(bare.state()),view=Object.create(bare);view.state=()=>s;assert.deepEqual(sync(dep.readLatest(view)),expected,'EOF authorization changed');const historical=sync(frozen.assertReviewStartupRpcState(view,original,s));assert.equal(typeof historical.paused,'boolean');assertEofGraceState(view,latest,s);return{...s,paused:false};}
  function cold(input){
    assert.deepEqual(process.execArgv,[]);assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);assert.equal(sha(readFileSync(process.execPath)),r.nodeExecutable.sha256);
    for(const name of ['capture','certificate','footprint','provider'])assert.equal(sha(readFileSync(resolve(helperRoot,'validation-execution-'+name+'.mjs'))),old.helperPins[name].sha256);
    const dir=safePath(bare.root,'private/eof-grace/diagnostics/'+randomUUID());mkdirSync(dir,{recursive:true});const inputPath=resolve(dir,'input.json');writeFileSync(inputPath,jsonBytes(input),{flag:'wx'});
    const timeout=validationExecutionCaptureBudget(bare),result=spawnSync(process.execPath,[resolve(helperRoot,'validation-execution-capture.mjs'),inputPath],{cwd:r.runtimeIdentity.cwd,env:{...process.env},timeout,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024});
    for(const[name,bytes]of [['stdout.txt',result.stdout??''],['stderr.txt',result.stderr??''],['result.json',jsonBytes({status:result.status,signal:result.signal,error:result.error?{code:result.error.code,message:result.error.message}:null,inputHash:sha(jsonBytes(input)),timeoutMs:timeout})]])writeFileSync(resolve(dir,name),bytes,{flag:'wx'});
    assert.equal(result.error,undefined,'Cold original audit failed');assert.equal(result.status,0,'Cold original audit rejected: '+result.stderr);return{...JSON.parse(result.stdout),inputPath};
  }
  function validateCurrent(owner=bare){
    const current=state(owner),physical=readFileSync(safePath(bare.root,'private/journal.jsonl')),hash=sha(physical);assert.equal(hash,sha(Buffer.concat(current.rows.map(jsonBytes))),'Noncanonical physical journal');const view=Object.create(bare);view.state=()=>current;
    sync(dep.verifyStatic(view,latest));
    if(!cached||cached.certificate.journalHash!==hash){cached=null;const input={root:norm(bare.root),sourceRoot:norm(resolve(bare.root,'builds',original.recovery.processingBuild.sourceDigest,original.recovery.processingBuild.binaryDigest,'source')),sourceHashes:original.recovery.sourceHashes,sourcePins:original.recovery.processingBuild,loaderSourceHash:original.recovery.sourceHashes['scripts/trix-scenario-collection/review-startup-rpc-recovery.mjs'],trackerSourceHash:old.helperPins.footprint.sha256,captureChildSourceHash:old.helperPins.capture.sha256,certificateVerifierSourceHash:old.helperPins.certificate.sha256,nodeExecutableHash:r.nodeExecutable.sha256,journalHash:hash,journalBoundary:{sequence:current.rows.at(-1).sequence,hash:current.rows.at(-1).hash},recoveryHash:original.recoveryHash};const prepared=clone(input),output=sync((dependencies.capture??cold)(input));assert.equal(output.status,'captured-original-full-reader');assert.deepEqual(output.certificate.result,original);assert.equal(output.certificate.journalHash,hash);assert.equal(output.certificateHash,sha(jsonBytes(output.certificate)));sync(dep.verifyCapture(output,prepared,parent));cached={...output,parentInput:prepared};metrics.captures++;}
    sync(dep.verifyCapture(cached,cached.parentInput,parent));const cert=cached.certificate;
    const result=sync(dep.verifyCertificate(cert,{certificateBytes:jsonBytes(cert),expectedCertificateHash:cached.certificateHash,expectedLoaderHash:original.recovery.sourceHashes['scripts/trix-scenario-collection/review-startup-rpc-recovery.mjs'],expectedTrackerHash:old.helperPins.footprint.sha256,expectedLatest:original,expectedNonFsInputs:cert.nonFsInputs,bareCollector:bare,readCurrentState:()=>state(bare),assertCurrentState:(c,o,s)=>{sync(frozen.assertReviewStartupRpcState(c,o,s));return assertEofGraceState(c,latest,s)}}));
    sync(dep.verifyStatic(view,latest));assert.equal(sha(readFileSync(safePath(bare.root,'private/journal.jsonl'))),hash);assert.deepEqual(sync(dep.readLatest(bare)),expected);metrics.rechecks++;return{...result,latest:expected,originalLatest:result.latest};
  }
  return{state,checkOwner,validateCurrent,loadLatest:owner=>validateCurrent(owner).latest,metrics};
}
